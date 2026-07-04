import { Suspense } from 'react';
import Workspace from './Workspace';

export default function WorkspacePage() {
  return (
    <div className="w-full h-screen bg-[#0f0f11] text-white">
      <Suspense fallback={<div className="flex h-full w-full items-center justify-center">Loading space...</div>}>
        <Workspace />
      </Suspense>
    </div>
  );
}
