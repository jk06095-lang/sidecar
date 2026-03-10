import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Home from './components/Home';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <div className="flex h-screen bg-[#f5f8fa] text-slate-800 font-sans overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'home' && <Home />}
        {activeTab !== 'home' && (
          <div className="p-8">
            <h1 className="text-2xl font-semibold capitalize">{activeTab.replace('-', ' ')}</h1>
            <p className="mt-4 text-slate-600">This section is under construction.</p>
          </div>
        )}
      </main>
    </div>
  );
}
