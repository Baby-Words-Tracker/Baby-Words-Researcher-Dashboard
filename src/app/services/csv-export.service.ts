import { Injectable } from '@angular/core';
import { IFirestoreRepository, FirestoreRepository } from './firestore-repository.service';
import { Child } from '../models/child.model';
import { Word } from '../models/word.model';
import { WordTracker } from '../models/word-tracker.model';
import { UserProfile } from '../models/user-profile.model';
import { downloadAsCSV } from '../util/download-as-csv';

export interface ChildWordBatchExportRequest {
  limit: number;
  afterId?: string;
}

export interface ChildWordBatchExportResult {
  selectedChildren: number;
  exportedRows: number;
  downloaded: boolean;
  nextCursor: string | null;
}

const CHILD_WORD_CSV_HEADER = [
  'Child_ID',
  'Word',
  'First_Utterance_DateTime',
  'Word_Language',
  'Lemma',
  'Primary_Part_Of_Speech',
  'All_Parts_Of_Speech',
  'Primary_Category',
  'All_Categories',
  'Notes',
  'Video_ID',
  'Phrase_ID',
  'Phrase_Text',
  'Child_Total_Word_Count',
  'Child_Languages',
  'Child_Birthday',
  'Parent_IDs',
  'Utterance_Language'
];

@Injectable({ providedIn: 'root' })
export class CsvExportService {
  private fireRepo: IFirestoreRepository;

  constructor(private repository: FirestoreRepository) {
    // Angular will provide the concrete implementation
    this.fireRepo = repository;
  }

  /**
   * exports all words from all children to a CSV file
   * excludes child names for anonymity
   * returns true if successful
   */
  async exportAllWordsToCSV(): Promise<boolean> {
    try {
      console.debug('CsvExportService: Starting to export all words to CSV');

      const allChildren = await this._getAllChildren();
      if (allChildren.length === 0) {
        console.debug('CsvExportService: No children found in database');
        return false;
      }
      console.debug(
        `CsvExportService: Found ${allChildren.length} children to process`
      );

      const csvData = await this._buildChildWordRows(allChildren);

      if (csvData.length === 0) {
        console.debug('CsvExportService: No word data found to export');
        return false;
      }

      console.debug(`CsvExportService: Exporting ${csvData.length} word records`);

      await downloadAsCSV(CHILD_WORD_CSV_HEADER, csvData, 'full_word_list');
      console.debug(
        `CsvExportService: Successfully exported ${csvData.length} words to CSV`
      );

      // Export parent demographics as an extension
      await this.exportParentDemographicsToCSV();

      return true;
    } catch (e) {
      console.debug('CsvExportService: Error exporting to CSV:', e);
      return false;
    }
  }

  async exportChildWordsBatchToCSV(
    request: ChildWordBatchExportRequest
  ): Promise<ChildWordBatchExportResult> {
    const page = await this.fireRepo.readPage(Child.collectionName, {
      limit: request.limit,
      afterId: request.afterId
    });
    const children = page.items.map((data) => {
      this._assertValidChildData(data);
      return Child.fromDataWithId(data);
    });
    const csvData = await this._buildChildWordRows(children);

    if (csvData.length > 0) {
      const pageName = request.afterId
        ? `after-${this._sanitizeFilenamePart(request.afterId)}`
        : 'first';
      await downloadAsCSV(
        CHILD_WORD_CSV_HEADER,
        csvData,
        `child_words_${pageName}_limit-${request.limit}`
      );
    }

    return {
      selectedChildren: children.length,
      exportedRows: csvData.length,
      downloaded: csvData.length > 0,
      nextCursor: page.nextCursor
    };
  }

  /**
   * exports demographic data for parent user profiles with surveyVersion "demographic-v1"
   * returns true if successful
   */
  async exportParentDemographicsToCSV(): Promise<boolean> {
    try {
      console.debug('CsvExportService: Starting to export parent demographics to CSV');

      const allUserProfiles = await this._getAllUserProfiles();
      const parentProfiles = allUserProfiles.filter(
        (profile) => profile.role === 'parent' && profile.surveyVersion === 'demographic-v1'
      );

      if (parentProfiles.length === 0) {
        console.debug('CsvExportService: No qualifying parent profiles found');
        return false;
      }

      console.debug(
        `CsvExportService: Found ${parentProfiles.length} qualifying parent profiles`
      );

      const csvData: string[][] = [];

      for (const profile of parentProfiles) {
        if (!profile.demographicData) {
          console.debug(`CsvExportService: Skipping profile ${profile.id} - no demographic data`);
          continue;
        }

        const demo = profile.demographicData;
        const row = [
          profile.id ?? '',
          demo.gender ?? '',
          demo.otherChildCare ?? '',
          demo.otherParentEducation ?? '',
          (demo.childCareArrangements || []).join(';'),
          demo.primaryLanguage ?? '',
          demo.genderOther ?? '',
          demo.educationLevel ?? '',
          (demo.childAges || []).join(';'),
          demo.householdIncome ?? '',
          demo.numberOfAdults ?? '',
          demo.otherLanguages ?? '',
          demo.completedAt ?? '',
          demo.ageRange ?? ''
        ];

        csvData.push(row);
      }

      if (csvData.length === 0) {
        console.debug('CsvExportService: No demographic data found to export');
        return false;
      }

      console.debug(`CsvExportService: Exporting ${csvData.length} demographic records`);

      const csvHeader = [
        'User_ID',
        'Gender',
        'Other_Child_Care',
        'Other_Parent_Education',
        'Child_Care_Arrangements',
        'Primary_Language',
        'Gender_Other',
        'Education_Level',
        'Child_Ages',
        'Household_Income',
        'Number_Of_Adults',
        'Other_Languages',
        'Completed_At',
        'Age_Range'
      ];

      await downloadAsCSV(csvHeader, csvData, 'parent_demographics');
      console.debug(
        `CsvExportService: Successfully exported ${csvData.length} demographic records to CSV`
      );
      return true;
    } catch (e) {
      console.debug('CsvExportService: Error exporting demographics to CSV:', e);
      return false;
    }
  }

  private async _buildChildWordRows(children: Child[]): Promise<string[][]> {
    const csvData: string[][] = [];

    for (const child of children) {
      console.debug(`CsvExportService: Processing child ${child.id}`);
      const wordTrackers = await this.fireRepo.readAllFromSubcollection(
        Child.collectionName,
        child.id ?? '',
        WordTracker.collectionName
      );

      for (const trackerData of wordTrackers) {
        this._assertValidWordTrackerData(trackerData, child.id ?? 'unknown');
        const tracker = WordTracker.fromDataWithId(trackerData);
        const word = await this._getWordDetails(tracker.id ?? '');
        console.debug('CsvExportService: fetched word details', word);

        const langDetails = tracker.language
          ? word?.languageDetails[tracker.language.name]
          : undefined;
        csvData.push([
          child.id ?? '',
          tracker.id ?? '',
          tracker.firstUtterance.toISOString(),
          tracker.language?.name ?? '',
          langDetails?.lemma ?? '',
          langDetails?.primaryPartOfSpeech ?? '',
          (langDetails?.allPOS || []).join(';'),
          langDetails?.primaryCategory ?? '',
          (langDetails?.allCategories || []).join(';'),
          tracker.note ?? '',
          tracker.videoId ?? '',
          tracker.phraseId ?? '',
          tracker.phraseText ?? '',
          String(child.wordCount ?? ''),
          (child.language || []).map((language) => language.name).join(';'),
          child.birthday.toISOString(),
          (child.parentIDs || []).join(';'),
          tracker.language?.name ?? ''
        ]);
      }
    }

    return csvData;
  }

  private _assertValidChildData(data: unknown): asserts data is Record<string, any> {
    if (!data || typeof data !== 'object') {
      throw new TypeError('Child data must be an object for CSV export');
    }
    const child = data as Record<string, any>;
    if (typeof child['id'] !== 'string' || child['id'].trim().length === 0) {
      throw new TypeError('Child data must include a non-empty ID for CSV export');
    }
    if (child['birthday'] !== undefined && !this._isValidDateValue(child['birthday'])) {
      throw new TypeError(
        `Child ${child['id']} has invalid birthday data for CSV export`
      );
    }
    if (
      child['wordCount'] !== undefined &&
      (typeof child['wordCount'] !== 'number' || !Number.isFinite(child['wordCount']))
    ) {
      throw new TypeError(
        `Child ${child['id']} has invalid wordCount data for CSV export`
      );
    }
    if (child['language'] !== undefined && !Array.isArray(child['language'])) {
      throw new TypeError(
        `Child ${child['id']} has invalid language data for CSV export`
      );
    }
    if (child['parentIDs'] !== undefined && !Array.isArray(child['parentIDs'])) {
      throw new TypeError(
        `Child ${child['id']} has invalid parentIDs data for CSV export`
      );
    }
  }

  private _assertValidWordTrackerData(
    data: unknown,
    childId: string
  ): asserts data is Record<string, any> {
    if (!data || typeof data !== 'object') {
      throw new TypeError(`Child ${childId} has invalid word data for CSV export`);
    }
    const tracker = data as Record<string, any>;
    if (typeof tracker['id'] !== 'string' || tracker['id'].trim().length === 0) {
      throw new TypeError(
        `Child ${childId} has word data without an ID for CSV export`
      );
    }
    if (
      tracker['firstUtterance'] !== undefined &&
      !this._isValidDateValue(tracker['firstUtterance'])
    ) {
      throw new TypeError(
        `Word ${tracker['id']} has invalid firstUtterance data for CSV export`
      );
    }
  }

  private _isValidDateValue(value: unknown): boolean {
    try {
      const date =
        value &&
        typeof value === 'object' &&
        'toDate' in value &&
        typeof (value as { toDate?: unknown }).toDate === 'function'
          ? (value as { toDate: () => Date }).toDate()
          : new Date(value as string | number | Date);
      return date instanceof Date && Number.isFinite(date.getTime());
    } catch {
      return false;
    }
  }

  private _sanitizeFilenamePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private async _getAllChildren(): Promise<Child[]> {
    try {
      const data = await this.fireRepo.readAll(Child.collectionName);
      return data.map((d) => Child.fromDataWithId(d));
    } catch (e) {
      console.debug('CsvExportService: Error getting all children:', e);
      return [];
    }
  }

  private async _getWordDetails(wordId: string): Promise<Word | null> {
    try {
      const data = await this.fireRepo.read(Word.collectionName, wordId);
      if (!data) return null;
      return Word.fromDataWithId(data);
    } catch (e) {
      console.debug(`CsvExportService: Error getting word details for ${wordId}:`, e);
      return null;
    }
  }

  private async _getAllUserProfiles(): Promise<UserProfile[]> {
    try {
      const data = await this.fireRepo.readAll(UserProfile.collectionName);
      return data.map((d) => UserProfile.fromDataWithId(d));
    } catch (e) {
      console.debug('CsvExportService: Error getting all user profiles:', e);
      return [];
    }
  }
}
