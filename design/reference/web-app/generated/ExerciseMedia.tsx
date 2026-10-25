import { useState } from 'react';
import './ExerciseMedia.css';
import { ExerciseImageSet } from './exerciseImages';
const Tag = ({
  text
}: {
  text: string;
}) => <span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-800 shadow-sm backdrop-blur">
    {text}
  </span>;
export const PoseImage = ({
  src,
  alt,
  className = ''
}: {
  src: string;
  alt: string;
  className?: string;
}) => <div className={`relative aspect-[4/3] overflow-hidden bg-slate-100 ${className}`}>
    <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
    <Tag text="AI image" />
  </div>;

// Smooth 6s loop: start pose, crossfade to end pose, hold, crossfade back.
export const LoopVideo = ({
  images,
  name,
  className = '',
  buttonClass = ''
}: {
  images: ExerciseImageSet;
  name: string;
  className?: string;
  buttonClass?: string;
}) => {
  const [playing, setPlaying] = useState(true);
  return <div className={`relative aspect-[4/3] overflow-hidden bg-slate-100 ${playing ? '' : 'mp-paused'} ${className}`}>
      <div className="mp-loop-stage absolute inset-0">
        <img src={images.start} alt={`${name}, start position`} className="absolute inset-0 h-full w-full object-cover" />
        <img src={images.end} alt={`${name}, end position`} className="mp-loop-end absolute inset-0 h-full w-full object-cover" />
      </div>
      <Tag text="AI video" />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10"><div className="mp-loop-bar h-full bg-teal-600/80" /></div>
      <button type="button" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause video' : 'Play video'} className={`absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${buttonClass}`}>
        {playing ? <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" /></svg> : <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 3 1.5z" /></svg>}
      </button>
    </div>;
};