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

@Component({
  selector: 'app-child-csv-export',
  imports: [ReactiveFormsModule],
  templateUrl: './child-csv-export.component.html',
  styleUrl: './child-csv-export.component.css'
})
export class ChildCsvExportComponent {
  private readonly csvExport = inject(CsvExportService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly exportForm = this.formBuilder.nonNullable.group({
    limit: [25, exportLimitValidator]
  });
  protected readonly inProgress = signal(false);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly status = signal<ExportStatus | null>(null);

  protected resetPagination(): void {
    this.nextCursor.set(null);
    this.status.set(null);
  }

  protected async downloadFirstBatch(): Promise<void> {
    this.nextCursor.set(null);
    await this.downloadBatch(undefined);
  }

  protected async downloadNextBatch(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor) return;
    await this.downloadBatch(cursor);
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
}
