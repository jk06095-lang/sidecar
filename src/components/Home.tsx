import { ChevronRight, Database, Code, GitBranch, Folder, Sparkles, CheckCircle, Terminal, BrainCircuit, Filter, BarChart, LineChart, Network, Search, Grid, FileText, LayoutTemplate, MonitorPlay } from 'lucide-react';

export default function Home() {
  const AppCard = ({ icon: Icon, title, description, iconColor, bgColor }: any) => (
    <div className="flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${bgColor} ${iconColor}`}>
        <Icon size={20} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-[#f8f9fa]">
      {/* Left Navigation */}
      <div className="w-64 p-6 border-r border-slate-200 hidden lg:block bg-white">
        <div className="w-full aspect-square bg-gradient-to-br from-orange-200 to-orange-400 rounded-xl mb-8 flex items-center justify-center shadow-inner overflow-hidden relative">
           <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent"></div>
           <div className="w-24 h-24 bg-white/30 backdrop-blur-sm rounded-2xl transform rotate-12 flex items-center justify-center border border-white/50 shadow-xl">
              <Database size={48} className="text-orange-600/80" />
           </div>
        </div>
        
        <div className="text-xs font-semibold text-slate-500 tracking-wider mb-4">NAVIGATION</div>
        <div className="space-y-1">
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-md font-medium">
            <ChevronRight size={16} /> Applications for Data Ops
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md">
            <ChevronRight size={16} /> Applications for Analytics
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md">
            <ChevronRight size={16} /> Applications for Operations
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {/* Welcome Banner */}
          <div className="bg-blue-600 rounded-xl p-6 text-white mb-10 shadow-lg bg-gradient-to-r from-blue-600 to-blue-500">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">👋</span> Welcome to SIDECAR.
            </h1>
            <p className="mt-2 text-blue-100 text-sm">
              SIDECAR is a data platform built for powerful data transformations, analysis, and data-driven decision-making.
            </p>
          </div>

          {/* Data Ops */}
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Applications for Data Ops</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AppCard 
                icon={Database} title="Dataset" description="Branch and version data" 
                bgColor="bg-blue-50" iconColor="text-blue-600" 
              />
              <AppCard 
                icon={Code} title="Code repositories" description="Author data pipelines" 
                bgColor="bg-slate-100" iconColor="text-slate-600" 
              />
              <AppCard 
                icon={GitBranch} title="Data Lineage" description="Manage data pipelines" 
                bgColor="bg-orange-50" iconColor="text-orange-600" 
              />
              <AppCard 
                icon={Folder} title="Projects" description="Manage access controls" 
                bgColor="bg-slate-100" iconColor="text-slate-600" 
              />
              <AppCard 
                icon={Sparkles} title="Data prep" description="Clean unformatted data" 
                bgColor="bg-pink-50" iconColor="text-pink-600" 
              />
              <AppCard 
                icon={CheckCircle} title="Catalog" description="Endorse trusted data assets" 
                bgColor="bg-purple-50" iconColor="text-purple-600" 
              />
            </div>
          </div>

          {/* Analytics */}
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Applications for Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AppCard 
                icon={Terminal} title="Code workbook" description="Develop data science models" 
                bgColor="bg-blue-50" iconColor="text-blue-600" 
              />
              <AppCard 
                icon={BrainCircuit} title="Machine Learning" description="Manage and deploy models" 
                bgColor="bg-slate-100" iconColor="text-slate-600" 
              />
              <AppCard 
                icon={Filter} title="Contour" description="Visualize, filter, and transform data" 
                bgColor="bg-orange-50" iconColor="text-orange-600" 
              />
              <AppCard 
                icon={BarChart} title="Reports" description="Create a data-driven report" 
                bgColor="bg-pink-50" iconColor="text-pink-600" 
              />
              <AppCard 
                icon={LineChart} title="Quiver" description="Explore time series data" 
                bgColor="bg-indigo-50" iconColor="text-indigo-600" 
              />
              <AppCard 
                icon={Network} title="Vertex" description="Build a connected company" 
                bgColor="bg-blue-50" iconColor="text-blue-600" 
              />
            </div>
          </div>

          {/* Operations */}
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Applications for Operations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AppCard 
                icon={Search} title="Object Explorer" description="Explore business nouns and verbs" 
                bgColor="bg-purple-50" iconColor="text-purple-600" 
              />
              <AppCard 
                icon={Grid} title="Fusion" description="Use familiar spreadsheet interface" 
                bgColor="bg-green-50" iconColor="text-green-600" 
              />
              <AppCard 
                icon={FileText} title="Forms" description="Input structured data" 
                bgColor="bg-slate-100" iconColor="text-slate-600" 
              />
              <AppCard 
                icon={LayoutTemplate} title="Slate" description="Create an application" 
                bgColor="bg-slate-100" iconColor="text-slate-600" 
              />
              <AppCard 
                icon={MonitorPlay} title="Workshop" description="Build interactive, object-backed apps" 
                bgColor="bg-indigo-50" iconColor="text-indigo-600" 
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
