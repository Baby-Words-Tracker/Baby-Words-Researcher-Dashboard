import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';
import { CsvExportService } from '../../services/csv-export.service';

const MIN_EXPORT_LIMIT = 1;
const MAX_EXPORT_LIMIT = 100;
const EXPORT_PROGRESS_STORAGE_KEY = 'wordbuds_child_csv_export_progress';

const exportLimitValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const value = control.value;
  return Number.isInteger(value) &&
    value >= MIN_EXPORT_LIMIT &&
    value <= MAX_EXPORT_LIMIT
    ? null
    : { exportLimit: true };
};

interface ExportStatus {
  kind: 'success' | 'error' | 'info';
  text: string;
}

interface SavedExportProgress {
  limit: number;
  nextCursor: string;
}

@Component({
  selector: 'app-child-csv-export',
  imports: [ReactiveFormsModule],
  templateUrl: './child-csv-export.component.html',
  styleUrl: './child-csv-export.component.css'
})
export class ChildCsvExportComponent {
  private readonly csvExport = inject(CsvExportService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly savedProgress = this.loadSavedProgress();

  protected readonly exportForm = this.formBuilder.nonNullable.group({
    limit: [this.savedProgress?.limit ?? 25, exportLimitValidator],
    resumeAfterId: [this.savedProgress?.nextCursor ?? '']
  });
  protected readonly inProgress = signal(false);
  protected readonly nextCursor = signal<string | null>(
    this.savedProgress?.nextCursor ?? null
  );
  protected readonly status = signal<ExportStatus | null>(null);

  protected hasManualResumeId(): boolean {
    return this.exportForm.controls.resumeAfterId.value.trim().length > 0;
  }

  protected async downloadFirstBatch(): Promise<void> {
    this.clearProgress(false);
    await this.downloadBatch(undefined);
  }

  protected async downloadFromResumeId(): Promise<void> {
    const resumeAfterId = this.exportForm.controls.resumeAfterId.value.trim();
    if (!resumeAfterId) return;
    await this.downloadBatch(resumeAfterId);
  }

  protected async downloadNextBatch(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor) return;
    await this.downloadBatch(cursor);
  }

  protected async copyResumeId(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor) return;
    try {
      await navigator.clipboard.writeText(cursor);
      this.status.set({ kind: 'info', text: 'Resume ID copied.' });
    } catch {
      this.status.set({
        kind: 'error',
        text: 'Could not copy the resume ID. Copy it manually instead.'
      });
    }
  }

  protected clearSavedProgress(): void {
    this.clearProgress(true);
  }

  private async downloadBatch(afterId: string | undefined): Promise<void> {
    if (this.exportForm.invalid || this.inProgress()) {
      this.exportForm.markAllAsTouched();
      return;
    }

    this.inProgress.set(true);
    this.status.set(null);
    try {
      const result = await this.csvExport.exportChildWordsBatchToCSV({
        limit: this.exportForm.controls.limit.value,
        afterId
      });
      this.nextCursor.set(result.nextCursor);
      this.exportForm.controls.resumeAfterId.setValue(result.nextCursor ?? '');
      if (result.nextCursor) {
        this.saveProgress({
          limit: this.exportForm.controls.limit.value,
          nextCursor: result.nextCursor
        });
      } else {
        this.removeSavedProgress();
      }

      if (result.downloaded) {
        const childrenLabel = result.selectedChildren === 1 ? 'child' : 'children';
        const terminalMessage = result.nextCursor
          ? ''
          : ' No more batches available.';
        this.status.set({
          kind: 'success',
          text: `Exported ${result.exportedRows} rows for ${result.selectedChildren} ${childrenLabel}.${terminalMessage}`
        });
      } else if (result.selectedChildren === 0) {
        this.status.set({ kind: 'info', text: 'No children available to export.' });
      } else {
        const terminalMessage = result.nextCursor
          ? ' Continue to the next batch.'
          : ' No more batches available.';
        this.status.set({
          kind: 'info',
          text: `The selected children have no word data.${terminalMessage}`
        });
      }
    } catch (error) {
      this.status.set({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Child CSV export failed.'
      });
    } finally {
      this.inProgress.set(false);
    }
  }

  private clearProgress(showStatus: boolean): void {
    this.nextCursor.set(null);
    this.exportForm.controls.resumeAfterId.setValue('');
    this.removeSavedProgress();
    if (showStatus) {
      this.status.set({ kind: 'info', text: 'Saved export progress cleared.' });
    }
  }

  private loadSavedProgress(): SavedExportProgress | null {
    try {
      const stored = window.localStorage.getItem(EXPORT_PROGRESS_STORAGE_KEY);
      if (!stored) return null;
      const progress = JSON.parse(stored) as Partial<SavedExportProgress>;
      if (
        !Number.isInteger(progress.limit) ||
        (progress.limit ?? 0) < MIN_EXPORT_LIMIT ||
        (progress.limit ?? 0) > MAX_EXPORT_LIMIT ||
        typeof progress.nextCursor !== 'string' ||
        progress.nextCursor.trim().length === 0
      ) {
        this.removeSavedProgress();
        return null;
      }
      return {
        limit: progress.limit as number,
        nextCursor: progress.nextCursor
      };
    } catch {
      this.removeSavedProgress();
      return null;
    }
  }

  private saveProgress(progress: SavedExportProgress): void {
    try {
      window.localStorage.setItem(
        EXPORT_PROGRESS_STORAGE_KEY,
        JSON.stringify(progress)
      );
    } catch {
      // The export still succeeds when browser storage is unavailable.
    }
  }

  private removeSavedProgress(): void {
    try {
      window.localStorage.removeItem(EXPORT_PROGRESS_STORAGE_KEY);
    } catch {
      // Browser storage is optional; manual resume remains available.
    }
  }
}
