import React from 'react';
import { NIGHT_ORDER, getRoleColor } from '../constants';
import { Shield, Droplet, Heart, Moon } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function NightView({ players, setPlayers, allRoles }) {
  const getRoleInfo = (roleId) => allRoles.find(r => r.id === roleId);

  // Nhóm người chơi theo role gốc
  const playersByRole = {};
  players.forEach(p => {
    if (p.role) {
      if (!playersByRole[p.role]) playersByRole[p.role] = [];
      playersByRole[p.role].push(p);
    }
  });

  // Chỉ lấy những role có trong game, và sắp xếp theo NIGHT_ORDER
  const rolesInGame = Object.keys(playersByRole);
  
  const orderedRoles = [];
  
  // 1. Lọc theo NIGHT_ORDER
  NIGHT_ORDER.forEach(roleId => {
    if (rolesInGame.includes(roleId)) {
      orderedRoles.push(roleId);
    }
  });

  // 2. Những role custom hoặc không có trong NIGHT_ORDER thì nhét xuống cuối
  rolesInGame.forEach(roleId => {
    if (!NIGHT_ORDER.includes(roleId)) {
      orderedRoles.push(roleId);
    }
  });

  const updatePlayerNote = (id, noteKey, value) => {
    setPlayers(players.map(p => {
      if (p.id === id) {
        return {
          ...p,
          notes: {
            ...(p.notes || {}),
            [noteKey]: value
          }
        };
      }
      return p;
    }));
  };

  const alivePlayers = players.filter(p => p.isAlive);

  const [filterType, setFilterType] = useState('all');

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 bg-card rounded-2xl shadow-xl border border-border">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Moon size={28} className="text-primary" />
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-1">Màn Hình Ban Đêm</h2>
            <p className="text-sm text-gray-500">Quản trò gọi dậy theo thứ tự từ trên xuống dưới.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <FilterButton active={filterType === 'all'} onClick={() => setFilterType('all')}>Tất cả</FilterButton>
          <FilterButton active={filterType === 'alive'} onClick={() => setFilterType('alive')}>Còn sống</FilterButton>
        </div>
      </div>

      <div className="space-y-4">
        {orderedRoles.map((roleId, index) => {
          const roleInfo = getRoleInfo(roleId);
          if (!roleInfo) return null;
          
          const style = getRoleColor(roleId, roleInfo.team);
          const playersWithThisRole = playersByRole[roleId];
          const playersToRender = filterType === 'alive' 
            ? playersWithThisRole.filter(p => p.isAlive)
            : playersWithThisRole;

          if (playersToRender.length === 0) return null;

          return (
            <div key={roleId} className="flex flex-col gap-2 relative pl-8">
              {/* Line kết nối */}
              <div className="absolute left-3 top-0 bottom-[-16px] w-0.5 bg-border z-0"></div>
              
              <div className="absolute left-0 top-6 w-6 h-6 rounded-full bg-background border-4 border-primary z-10 flex items-center justify-center">
                <span className="text-[10px] font-bold text-foreground">{index + 1}</span>
              </div>

              {playersToRender.map(player => {
                const notes = player.notes || {};
                const isDead = !player.isAlive;

                return (
                  <div key={player.id} className={cn(
                    "flex flex-col sm:flex-row border-2 rounded-xl overflow-hidden shadow-sm z-10 ml-2 transition-opacity",
                    style.border,
                    isDead && "opacity-50 grayscale"
                  )}>
                    {/* Left: Tên Role */}
                    <div className={cn(
                      "sm:w-1/3 px-4 py-3 flex items-center font-bold text-sm",
                      style.bg, style.whiteText
                    )}>
                      {roleInfo.name}
                      {isDead && <span className="ml-2 text-xs font-normal opacity-80">(Đã chết)</span>}
                    </div>
                    
                    {/* Right: Tên Người chơi + Ghi chú */}
                    <div className="sm:w-2/3 bg-black flex flex-col justify-center px-4 py-3 min-h-[56px]">
                      <span className="font-bold text-white text-base mb-1">{player.name}</span>
                      
                      {/* Night Notes (Phù thủy / Bảo vệ) */}
                      {!isDead && roleId === 'phu_thuy' && (
                        <div className="flex gap-4 mt-2 pt-2 border-t border-gray-800">
                          <label className="flex items-center gap-1.5 cursor-pointer text-green-400 hover:text-green-300 text-sm font-medium">
                            <input 
                              type="checkbox" 
                              checked={notes.usedSave || false} 
                              onChange={(e) => updatePlayerNote(player.id, 'usedSave', e.target.checked)}
                              className="accent-green-500 w-4 h-4 cursor-pointer"
                            />
                            <Heart size={14} /> Cứu
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-red-400 hover:text-red-300 text-sm font-medium">
                            <input 
                              type="checkbox" 
                              checked={notes.usedKill || false} 
                              onChange={(e) => updatePlayerNote(player.id, 'usedKill', e.target.checked)}
                              className="accent-red-500 w-4 h-4 cursor-pointer"
                            />
                            <Droplet size={14} /> Độc
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        })}
        {orderedRoles.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Chưa có người chơi nào được phân vai trò.
          </div>
        )}
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-xs font-medium rounded-full transition-colors border",
        active 
          ? "bg-primary text-white border-primary" 
          : "bg-background text-foreground border-border hover:bg-gray-100 dark:hover:bg-gray-800"
      )}
    >
      {children}
    </button>
  );
}
