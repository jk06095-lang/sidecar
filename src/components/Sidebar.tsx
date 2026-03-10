import { 
  Home, Search, Bell, Clock, Folder, LayoutGrid, 
  Globe, HelpCircle, ExternalLink, Activity,
  Star, Menu, Command, Shuffle, MapPin, MonitorPlay
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Sidebar({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) {
  const navItemClass = "flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer transition-colors";
  const activeClass = "bg-slate-800 text-white font-medium";

  return (
    <div className="w-64 h-full bg-[#1c232b] flex flex-col border-r border-slate-800 overflow-y-auto custom-scrollbar">
      {/* Logo Area */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2 text-teal-400 font-bold text-xl tracking-wider">
          <div className="w-6 h-6 rounded-full bg-teal-500/20 border-2 border-teal-400 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-teal-400" />
          </div>
          SIDECAR
        </div>
        <button className="text-slate-400 hover:text-white">
          <Menu size={18} />
        </button>
      </div>

      {/* Section 1 */}
      <div className="py-2 border-b border-slate-800">
        <div className={cn(navItemClass, activeTab === 'home' && activeClass)} onClick={() => setActiveTab('home')}>
          <Home size={18} />
          <span>Home</span>
        </div>
        <div className={cn(navItemClass, "justify-between")} onClick={() => setActiveTab('search')}>
          <div className="flex items-center gap-3">
            <Search size={18} />
            <span>Search...</span>
          </div>
          <div className="flex items-center text-xs text-slate-500 gap-0.5">
            <Command size={12} />
            <span>J</span>
          </div>
        </div>
        <div className={cn(navItemClass, activeTab === 'notifications' && activeClass)} onClick={() => setActiveTab('notifications')}>
          <Bell size={18} />
          <span>Notifications</span>
        </div>
      </div>

      {/* Section 2 */}
      <div className="py-2 border-b border-slate-800">
        <div className={cn(navItemClass, activeTab === 'recent' && activeClass)} onClick={() => setActiveTab('recent')}>
          <Clock size={18} />
          <span>Recent</span>
        </div>
        <div className={cn(navItemClass, activeTab === 'projects' && activeClass)} onClick={() => setActiveTab('projects')}>
          <Folder size={18} />
          <span>Projects & files</span>
        </div>
        <div className={cn(navItemClass, activeTab === 'applications' && activeClass)} onClick={() => setActiveTab('applications')}>
          <LayoutGrid size={18} />
          <span>Applications Portal</span>
        </div>
      </div>

      {/* Section 3: Favorites */}
      <div className="py-4 border-b border-slate-800 flex-1">
        <div className="px-4 mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 tracking-wider">
          <span>PLATFORM APPS</span>
          <span className="hover:text-slate-300 cursor-pointer">View all</span>
        </div>
        <div className={cn(navItemClass)}>
          <div className="w-6 h-6 rounded bg-purple-900/50 text-purple-400 flex items-center justify-center"><Search size={14} /></div>
          <span className="truncate">Object explorer</span>
        </div>
        <div className={cn(navItemClass)}>
          <div className="w-6 h-6 rounded bg-indigo-900/50 text-indigo-400 flex items-center justify-center"><MonitorPlay size={14} /></div>
          <span className="truncate">Workshop</span>
        </div>

        <div className="px-4 mt-6 mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 tracking-wider">
          <span>PROMOTED APPS</span>
          <span className="hover:text-slate-300 cursor-pointer">View all</span>
        </div>
        <div className={cn(navItemClass)}>
          <div className="w-6 h-6 rounded bg-green-900/50 text-green-400 flex items-center justify-center"><LayoutGrid size={14} /></div>
          <span className="truncate">Aircraft Maintenance In...</span>
          <Star size={14} className="ml-auto text-yellow-500 fill-yellow-500" />
        </div>
        <div className={cn(navItemClass)}>
          <div className="w-6 h-6 rounded bg-lime-900/50 text-lime-400 flex items-center justify-center"><Activity size={14} /></div>
          <span className="truncate">Alert Investigator</span>
        </div>

        <div className="px-4 mt-6 mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 tracking-wider">
          <span>PROJECTS & FILES</span>
          <span className="hover:text-slate-300 cursor-pointer">View all</span>
        </div>
        <div className={cn(navItemClass)}>
          <div className="w-6 h-6 rounded bg-purple-900/50 text-purple-400 flex items-center justify-center"><LayoutGrid size={14} /></div>
          <span className="truncate">Flight Alert management</span>
        </div>
        <div className={cn(navItemClass)}>
          <div className="w-6 h-6 rounded bg-blue-900/50 text-blue-400 flex items-center justify-center"><LayoutGrid size={14} /></div>
          <span className="truncate">flight</span>
        </div>
        <div className={cn(navItemClass)}>
          <Folder size={18} className="text-yellow-500 fill-yellow-500" />
          <span className="truncate">aircraft</span>
        </div>

        <div className="px-4 mt-6 mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 tracking-wider">
          <span>OBJECTS</span>
          <span className="hover:text-slate-300 cursor-pointer">View all</span>
        </div>
        <div className={cn(navItemClass)}>
          <div className="w-6 h-6 rounded bg-red-900/50 text-red-400 flex items-center justify-center"><MapPin size={14} /></div>
          <span className="truncate">John F Kennedy Internati...</span>
        </div>
      </div>

      {/* Section 4 */}
      <div className="p-4 border-b border-slate-800 flex flex-col gap-3">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Globe size={18} className="text-slate-400" />
          <select className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-1.5">
            <option>English</option>
            <option>Korean</option>
          </select>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Shuffle size={18} className="text-slate-400" />
          <div className="flex items-center justify-between w-full bg-slate-800 border border-slate-700 rounded p-1.5">
            <span>Track</span>
            <select className="bg-transparent border-none text-slate-200 text-sm focus:ring-0 p-0 pr-4">
              <option>Default</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 5 */}
      <div className="py-2">
        <div className={cn(navItemClass, activeTab === 'help' && activeClass)} onClick={() => setActiveTab('help')}>
          <HelpCircle size={18} />
          <span>Help & support</span>
        </div>
        <div className={cn(navItemClass, activeTab === 'account' && activeClass)} onClick={() => setActiveTab('account')}>
          <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold">LK</div>
          <span>Account</span>
        </div>
        <div className={cn(navItemClass, activeTab === 'workspaces' && activeClass)} onClick={() => setActiveTab('workspaces')}>
          <ExternalLink size={18} />
          <span>Open other workspaces</span>
        </div>
      </div>
    </div>
  );
}
