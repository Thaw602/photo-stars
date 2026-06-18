import { useRef, useState, useEffect } from 'react';
import { useAppStore } from '../../store';

interface UploadButtonProps {
  onUploaded: () => void;
}

export default function UploadButton({ onUploaded }: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPhoto = useAppStore((s) => s.uploadPhoto);
  const uploadInProgress = useAppStore((s) => s.uploadInProgress);
  const uploadProgress = useAppStore((s) => s.uploadProgress);

  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
  const dragCounter = useRef(0);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      if (e.dataTransfer?.types.includes('Files')) setDragOver(true);
    };
    const onDragOver = (ev: DragEvent) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (_e: DragEvent) => {
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragOver(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) validateAndUpload(file);
    };
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  const validateAndUpload = async (file: File) => {
    setError(null);
    setSuccess(false);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPEG / PNG / WebP / MP4 formats are supported');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File must be under 20MB');
      return;
    }
    try {
      let uploadFile = file;
      if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) {
        uploadFile = await compressImage(file);
      }
      await uploadPhoto(uploadFile);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUploaded();
    } catch (err: any) {
      setError(err.message || 'Upload failed, please try again');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" style={{ display: 'none' }} onChange={handleFileChange} />
      {uploadInProgress ? (
        <div className="upload-progress">
          <div className="upload-progress-bar"><div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} /></div>
          <span className="upload-progress-text">{Math.round(uploadProgress)}%</span>
        </div>
      ) : (
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()} title="Upload photo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}
      {dragOver && <div className="upload-drag-overlay"><span>Drop to upload</span></div>}
      {error && <div className="upload-toast upload-error">{error}</div>}
      {success && <div className="upload-toast upload-success">Upload successful!</div>}
    </>
  );
}

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, _reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX_LONG = 1920;
      let w = img.width, h = img.height;
      if (w > MAX_LONG || h > MAX_LONG) {
        if (w > h) { h = Math.round(h * MAX_LONG / w); w = MAX_LONG; }
        else { w = Math.round(w * MAX_LONG / h); h = MAX_LONG; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        else resolve(file);
      }, 'image/jpeg', 0.82);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}
