import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { App } from './app';
import { AuthService } from './services/auth.service';
import { CsvExportService } from './services/csv-export.service';
import { FirebaseHandlerService } from './services/firebase_handler.service';
import { ResearchersDataService } from './services/researchers-data.service';

describe('App', () => {
  let testRole: string | null;

  beforeEach(async () => {
    testRole = null;
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => testRole),
        removeItem: vi.fn()
      },
      configurable: true
    });

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: AuthService,
          useValue: {
            authState$: of(null),
            login: vi.fn().mockResolvedValue({}),
            logout: vi.fn().mockResolvedValue(undefined)
          }
        },
        {
          provide: FirebaseHandlerService,
          useValue: {
            adminCollectionNames: ['UserProfile'],
            userProfileDisplayFields: [],
            getAllItems: vi.fn().mockReturnValue(of([])),
            getCurrentUserProfile: vi.fn().mockResolvedValue(null),
            refreshItems: vi.fn(),
            addItem: vi.fn().mockResolvedValue('new-id'),
            updateItem: vi.fn().mockResolvedValue(undefined)
          }
        },
        {
          provide: CsvExportService,
          useValue: {
            exportChildWordsBatchToCSV: vi.fn()
          }
        },
        {
          provide: ResearchersDataService,
          useValue: {
            getChildrenWithWordCount: vi.fn().mockResolvedValue([]),
            getChildUtteranceCountsByDay: vi.fn().mockResolvedValue([])
          }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the login screen when signed out', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Log in');
  });

  it('integrates the child CSV export into the researchers dashboard', async () => {
    testRole = 'researcher';
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const exportComponent = fixture.nativeElement.querySelector(
      'app-child-csv-export'
    );
    expect(exportComponent).not.toBeNull();
    expect(exportComponent.textContent).toContain('Export child word data');
  });
});
