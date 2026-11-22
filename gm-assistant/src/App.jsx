import { useState } from 'react';
import PlayerSetup from './components/PlayerSetup';
import RoleAssignment from './components/RoleAssignment';
import GameDashboard from './components/GameDashboard';
import NightView from './components/NightView';
import { DEFAULT_ROLES } from './constants';
import { Moon, Users, Shield, Grid, LayoutList, RefreshCw, Trash2, ArrowLeft } from 'lucide-react';

function App() {
  const [step, setStep] = useState(1);
  const [players, setPlayers] = useState([]);
  
  // Toàn bộ roles (Mặc định + Custom)
  const [allRoles, setAllRoles] = useState(DEFAULT_ROLES);
  
  // Quản lý số lượng thẻ cho mỗi role (Ví dụ: { dan_lang: 4, soi_thuong: 2 })
  const [roleQuantities, setRoleQuantities] = useState({});

  // Tính tổng số thẻ bài đã chọn
  const totalCards = Object.values(roleQuantities).reduce((a, b) => a + b, 0);

  // Tạo mảng thẻ bài cụ thể dựa trên số lượng (VD: [{id: dan_lang, instId: 0}, {id: dan_lang, instId: 1}])
  const expandedRoles = [];
  Object.entries(roleQuantities).forEach(([roleId, qty]) => {
    const roleInfo = allRoles.find(r => r.id === roleId);
    if (roleInfo) {
      for (let i = 0; i < qty; i++) {
        expandedRoles.push({
          ...roleInfo,
          instanceId: `${roleId}_${i}` // ID duy nhất cho thẻ bài vật lý
        });
      }
    }
  });
  // Helper to count alive per team
  const alivePlayers = players.filter(p => p.isAlive);
  const getRoleInfoApp = (roleId) => allRoles.find(r => r.id === roleId);
  const aliveWolves = alivePlayers.filter(p => getRoleInfoApp(p.role)?.team === 'WEREWOLF').length;
  const aliveVillagers = alivePlayers.filter(p => getRoleInfoApp(p.role)?.team === 'VILLAGER').length;
  const aliveMutants = alivePlayers.filter(p => getRoleInfoApp(p.role)?.team === 'MUTANT').length;

  return (
    <div className="min-h-screen p-4 sm:p-8 relative">
      {/* Header Navigation */}
      <header className="max-w-5xl mx-auto mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg">
              <Moon size={24} className="fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2 pb-1">
                <h1 className="text-2xl font-bold tracking-tight text-foreground m-0 leading-none">Ma Sói</h1>
                <a
                  href="/"
                  className="px-2.5 py-1 text-[11px] font-bold bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/30 rounded-lg inline-flex items-center gap-1 transition-colors"
                  title="Quay lại SCHOOL UNIVERSE Online"
                >
                  <ArrowLeft size={12} /> SCHOOL UNIVERSE
                </a>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-500 font-medium m-0 leading-none">SCHOOL UNIVERSE • Quản Trò Offline</p>
                {players.length > 0 && (
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full dark:bg-green-900/40 dark:text-green-400">
                    Sống: {alivePlayers.length}/{players.length} (Dân: {aliveVillagers}, Sói: {aliveWolves}, Khác: {aliveMutants})
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:ml-4">
            <button 
              onClick={() => {
                if (window.confirm('Chơi lại với đội hình hiện tại? Các vai trò đã gán sẽ bị xóa.')) {
                  setPlayers(players.map(p => ({ id: p.id, name: p.name, isAlive: true, role: null, roleInstId: null, notes: {} })));
                  setStep(2);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg flex items-center gap-1 transition-colors"
            >
              <RefreshCw size={14} /> Chơi Lại (Giữ người)
            </button>
            <button 
              onClick={() => {
                if (window.confirm('Quản trò mới? Đội hình sẽ được giữ nguyên và chuyển về Trang 1 để bạn có thể thêm/bớt người chơi hoặc thay đổi số lượng bài.')) {
                  setPlayers(players.map(p => ({ id: p.id, name: p.name, isAlive: true, role: null, roleInstId: null, notes: {} })));
                  setStep(1);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded-lg flex items-center gap-1 transition-colors"
            >
              <Users size={14} /> Đổi Đội Hình
            </button>
          </div>
        </div>
        
        <div className="flex bg-background border border-border rounded-xl p-1 shadow-sm">
          <NavButton active={step === 1} onClick={() => setStep(1)} icon={<Users size={18} />} text="1. Setup" />
          <NavButton active={step === 2} onClick={() => setStep(2)} icon={<Shield size={18} />} text="2. Gán Bài" />
          <NavButton active={step === 3} onClick={() => setStep(3)} icon={<Grid size={18} />} text="3. Thẻ Bài" />
          <NavButton active={step === 4} onClick={() => setStep(4)} icon={<LayoutList size={18} />} text="4. Gọi Đêm" />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative">
        {step === 1 && (
          <PlayerSetup 
            players={players} 
            setPlayers={setPlayers} 
            allRoles={allRoles}
            setAllRoles={setAllRoles}
            roleQuantities={roleQuantities}
            setRoleQuantities={setRoleQuantities}
            totalCards={totalCards}
            onNext={() => setStep(2)} 
          />
        )}
        
        {step === 2 && (
          <RoleAssignment 
            players={players} 
            setPlayers={setPlayers} 
            expandedRoles={expandedRoles}
            onNext={() => setStep(3)}
            onPrev={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <GameDashboard 
            players={players} 
            setPlayers={setPlayers} 
            allRoles={allRoles}
          />
        )}

        {step === 4 && (
          <NightView 
            players={players} 
            setPlayers={setPlayers} 
            allRoles={allRoles}
          />
        )}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, text }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
        active ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{text}</span>
    </button>
  );
}

export default App;
