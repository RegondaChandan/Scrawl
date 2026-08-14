import type { DrawioImportResult } from '@scrawl/interchange';
import { Icon } from './Icon';
import { Modal } from './Modal';

export type ImportDialogState =
  | { kind: 'error'; fileName: string; message: string }
  | { kind: 'drawio'; fileName: string; result: DrawioImportResult };

interface ImportDialogProps {
  state: ImportDialogState;
  onClose: () => void;
  onImport: (result: DrawioImportResult) => void;
}

export function ImportDialog({ state, onClose, onImport }: ImportDialogProps): React.JSX.Element {
  const report = state.kind === 'drawio' ? state.result.report : null;
  const visibleIssues = report?.issues.slice(0, 20) ?? [];

  return (
    <Modal className="import-dialog" labelledBy="import-dialog-title" onClose={onClose}>
      <header className="modal-header">
        <div>
          <span className="modal-eyebrow">Local file</span>
          <h2 id="import-dialog-title">
            {state.kind === 'error' ? 'Unable to open file' : 'Import draw.io diagram'}
          </h2>
          <p>{state.fileName}</p>
        </div>
        <button aria-label="Close import dialog" onClick={onClose} type="button">
          <Icon name="x" size={17} />
        </button>
      </header>

      {state.kind === 'error' ? (
        <div className="import-error" role="alert">
          <strong>The current document was not changed.</strong>
          <p>{state.message}</p>
        </div>
      ) : (
        <>
          <div className="import-summary" aria-label="Import summary">
            <div>
              <strong>{report!.importedPages}</strong>
              <span>Pages</span>
            </div>
            <div>
              <strong>{report!.importedElements}</strong>
              <span>Editable objects</span>
            </div>
            <div>
              <strong>{report!.approximatedElements}</strong>
              <span>Approximated</span>
            </div>
            <div>
              <strong>{report!.skippedElements}</strong>
              <span>Skipped</span>
            </div>
          </div>

          <div className="import-report-scroll">
            <section className="import-page-report">
              <h3>Pages</h3>
              {report!.pages.map((page, index) => (
                <div key={`${index}-${page.name}`}>
                  <strong>{page.name}</strong>
                  <span>
                    {page.importedElements} objects
                    {page.approximatedElements > 0
                      ? ` · ${page.approximatedElements} approximated`
                      : ''}
                    {page.skippedElements > 0 ? ` · ${page.skippedElements} skipped` : ''}
                  </span>
                </div>
              ))}
            </section>

            {visibleIssues.length > 0 ? (
              <section className="import-warnings">
                <h3>Compatibility notes</h3>
                <ul>
                  {visibleIssues.map((issue, index) => (
                    <li key={`${issue.pageName}-${issue.cellId ?? index}-${issue.code}`}>
                      <strong>{issue.pageName}</strong>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
                {report!.issues.length > visibleIssues.length ? (
                  <p>{report!.issues.length - visibleIssues.length} additional notes not shown.</p>
                ) : null}
              </section>
            ) : (
              <p className="import-clean-report">All supported objects are ready to import.</p>
            )}
          </div>

          <p className="import-safety-note">
            The file was processed on this device. Your current document remains unchanged until you
            replace it below.
          </p>
        </>
      )}

      <footer className="modal-actions">
        <button autoFocus className="secondary-button" onClick={onClose} type="button">
          {state.kind === 'error' ? 'Close' : 'Cancel'}
        </button>
        {state.kind === 'drawio' ? (
          <button className="primary-button" onClick={() => onImport(state.result)} type="button">
            Replace document
          </button>
        ) : null}
      </footer>
    </Modal>
  );
}
