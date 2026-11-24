import Modal from './Modal.jsx';

export default function ConfirmDialog({ title, children, confirmLabel = '확인', cancelLabel = '취소', danger, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      titleId="confirm-title"
      size="sm"
      role="alertdialog"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="rb-btn" onClick={onCancel} data-autofocus>{cancelLabel}</button>
          <button type="button" className={`rb-btn ${danger ? 'rb-btn--danger' : 'rb-btn--primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
