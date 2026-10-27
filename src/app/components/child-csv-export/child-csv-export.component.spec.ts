import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ChildCsvExportComponent } from './child-csv-export.component';
import { CsvExportService } from '../../services/csv-export.service';

describe('ChildCsvExportComponent', () => {
  const exportChildWordsBatchToCSV = vi.fn();

  beforeEach(async () => {
    exportChildWordsBatchToCSV.mockReset();
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
