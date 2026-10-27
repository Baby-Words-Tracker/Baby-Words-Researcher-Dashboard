import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ChildCsvExportComponent } from './child-csv-export.component';
import { CsvExportService } from '../../services/csv-export.service';

describe('ChildCsvExportComponent', () => {
  const progressStorageKey = 'wordbuds_child_csv_export_progress';
  const exportChildWordsBatchToCSV = vi.fn();
  const writeText = vi.fn();

  beforeEach(async () => {
    exportChildWordsBatchToCSV.mockReset();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    const storedValues = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => storedValues.clear(),
        getItem: (key: string) => storedValues.get(key) ?? null,
        removeItem: (key: string) => storedValues.delete(key),
        setItem: (key: string, value: string) => storedValues.set(key, value)
      }
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    await TestBed.configureTestingModule({
      imports: [ChildCsvExportComponent],
      providers: [
        {
          provide: CsvExportService,
          useValue: { exportChildWordsBatchToCSV }
        }
      ]
    }).compileComponents();
  });

  it('exports a first batch and then uses its cursor for the next batch', async () => {
    exportChildWordsBatchToCSV
      .mockResolvedValueOnce({
        selectedChildren: 2,
        exportedRows: 4,
        downloaded: true,
        nextCursor: 'child-b'
      })
      .mockResolvedValueOnce({
        selectedChildren: 1,
        exportedRows: 2,
        downloaded: true,
        nextCursor: null
      });
    const fixture = TestBed.createComponent(ChildCsvExportComponent);
    fixture.detectChanges();

    const firstButton = findButton(fixture.nativeElement, 'Download first batch');
    firstButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(exportChildWordsBatchToCSV).toHaveBeenNthCalledWith(1, {
      limit: 25,
      afterId: undefined
    });
    expect(fixture.nativeElement.textContent).toContain(
      'Exported 4 rows for 2 children.'
    );
    expect(fixture.nativeElement.textContent).toContain('child-b');
    expect(JSON.parse(window.localStorage.getItem(progressStorageKey) ?? '{}')).toEqual({
      limit: 25,
      nextCursor: 'child-b'
    });

    const nextButton = findButton(fixture.nativeElement, 'Download next batch');
    expect(nextButton.disabled).toBe(false);
    nextButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(exportChildWordsBatchToCSV).toHaveBeenNthCalledWith(2, {
      limit: 25,
      afterId: 'child-b'
    });
    expect(nextButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No more batches available.');
    expect(window.localStorage.getItem(progressStorageKey)).toBeNull();
  });

  it('starts a batch after a manually entered child ID', async () => {
    exportChildWordsBatchToCSV.mockResolvedValue({
      selectedChildren: 2,
      exportedRows: 3,
      downloaded: true,
      nextCursor: 'child-99'
    });
    const fixture = TestBed.createComponent(ChildCsvExportComponent);
    fixture.detectChanges();
    const resumeInput = fixture.nativeElement.querySelector(
      '#child-export-resume'
    ) as HTMLInputElement;

    resumeInput.value = 'child-42';
    resumeInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    findButton(fixture.nativeElement, 'Download from resume ID').click();
    await fixture.whenStable();

    expect(exportChildWordsBatchToCSV).toHaveBeenCalledWith({
      limit: 25,
      afterId: 'child-42'
    });
  });

  it('restores saved progress and can copy or clear its resume ID', async () => {
    window.localStorage.setItem(
      progressStorageKey,
      JSON.stringify({ limit: 10, nextCursor: 'saved-child' })
    );
    const fixture = TestBed.createComponent(ChildCsvExportComponent);
    fixture.detectChanges();

    const limitInput = fixture.nativeElement.querySelector(
      '#child-export-limit'
    ) as HTMLInputElement;
    expect(limitInput.value).toBe('10');
    expect(fixture.nativeElement.textContent).toContain('saved-child');
    expect(findButton(fixture.nativeElement, 'Download next batch').disabled).toBe(false);

    findButton(fixture.nativeElement, 'Copy resume ID').click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('saved-child');

    findButton(fixture.nativeElement, 'Clear saved progress').click();
    fixture.detectChanges();
    expect(window.localStorage.getItem(progressStorageKey)).toBeNull();
    expect(findButton(fixture.nativeElement, 'Download next batch').disabled).toBe(true);
  });

  it('rejects an invalid limit before calling the export service', () => {
    const fixture = TestBed.createComponent(ChildCsvExportComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;

    input.value = '0';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(findButton(fixture.nativeElement, 'Download first batch').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Limit must be a whole number between 1 and 100.'
    );
    expect(exportChildWordsBatchToCSV).not.toHaveBeenCalled();
  });

  it('shows malformed export data errors returned by the service', async () => {
    exportChildWordsBatchToCSV.mockRejectedValue(
      new TypeError('Child child-invalid has invalid birthday data for CSV export')
    );
    const fixture = TestBed.createComponent(ChildCsvExportComponent);
    fixture.detectChanges();

    findButton(fixture.nativeElement, 'Download first batch').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Child child-invalid has invalid birthday data for CSV export'
    );
  });

  it('disables export actions while a batch is being created', () => {
    exportChildWordsBatchToCSV.mockReturnValue(new Promise(() => {}));
    const fixture = TestBed.createComponent(ChildCsvExportComponent);
    fixture.detectChanges();

    const firstButton = findButton(fixture.nativeElement, 'Download first batch');
    firstButton.click();
    fixture.detectChanges();

    expect(firstButton.disabled).toBe(true);
    expect(findButton(fixture.nativeElement, 'Download next batch').disabled).toBe(true);
    expect(firstButton.textContent).toContain('Exporting');
  });
});

function findButton(root: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text)
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Could not find button containing "${text}"`);
  }
  return button;
}
