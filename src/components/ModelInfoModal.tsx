import React from 'react';
import { ModelMetadata } from '../types';

interface ModelInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: ModelMetadata | null;
}

export const ModelInfoModal: React.FC<ModelInfoModalProps> = ({ isOpen, onClose, metadata }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl font-mono text-xs overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h2 className="font-bold text-white text-sm tracking-wider font-sans">
              3D ANATOMICAL MODEL & TOPOLOGY INSPECTOR
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 font-sans text-zinc-300">
          <div className="bg-black/60 border border-zinc-800 rounded-lg p-3.5 flex flex-col gap-2 font-mono text-xs">
            <div className="flex justify-between items-center text-zinc-400">
              <span>MODEL NAME:</span>
              <strong className="text-white">{metadata?.name || 'LeePerrySmith Photogrammetry Scan'}</strong>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>POLYGON TOPOLOGY:</span>
              <strong className="text-emerald-400">{metadata ? `${metadata.vertices.toLocaleString()} Vertices / ${metadata.triangles.toLocaleString()} Polygons` : '9,279 Vertices / 18,558 Polygons'}</strong>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>VISUAL STYLE:</span>
              <strong className="text-white">Scientific White Wireframe on Pure Black</strong>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>SKELETAL RIG:</span>
              <strong className="text-cyan-400">Anatomical Cervical Spine (C1 - C7 Articulation)</strong>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-1 font-mono text-emerald-400">
              Anatomical Facial & Cranial Features Present
            </h3>
            <ul className="grid grid-cols-2 gap-2 text-xs text-zinc-300 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800">
              <li className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Realistic skull vault & temples</li>
              <li className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Supraorbital ridges & eye orbits</li>
              <li className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Sculpted eyelids & eye globes</li>
              <li className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Nasal bridge, tip & nostrils</li>
              <li className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Upper/lower lips & oral fissure</li>
              <li className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Chin & mandibular jawline</li>
              <li className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Realistic ears with helix & tragus</li>
              <li className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Cervical neck & sternocleidomastoid</li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-1 font-mono text-cyan-400">
              Joint Hierarchy & Motion Kinematics
            </h3>
            <div className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800 text-xs text-zinc-300 flex flex-col gap-2 font-mono">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Root:</span>
                <span className="text-white">Cervical_C7_Base</span>
                <span className="text-zinc-500 text-[10px]">(Fixed base of neck at clavicle)</span>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <span className="text-zinc-500">└──</span>
                <span className="text-cyan-300">Cervical_C4_Mid</span>
                <span className="text-zinc-400 text-[10px]">(Absorbs 35% pitch flexion & lateral roll)</span>
              </div>
              <div className="flex items-center gap-2 pl-8">
                <span className="text-zinc-500">└──</span>
                <span className="text-emerald-300">Cranium_C1_Head</span>
                <span className="text-zinc-400 text-[10px]">(Absorbs 65% pitch, roll + axial yaw)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-sans font-medium text-xs transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
