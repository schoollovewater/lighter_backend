import React, { useState } from 'react';
import { UserPlus, X, ArrowRight, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getRoleColor } from '../constants';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function PlayerSetup({ 
  players, 
  setPlayers, 
  allRoles, 
  setAllRoles, 
  roleQuantities, 
  setRoleQuantities,
  totalCards,
  onNext 
}) {
  const [name, setName] = useState('');
  const [showCustomRoleForm, setShowCustomRoleForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleTeam, setNewRoleTeam] = useState('VILLAGER');

  const handleAddPlayer = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) return;
    
    setPlayers([...players, { id: Date.now().toString(), name: name.trim(), roleInstId: null, isAlive: true, notes: {} }]);
    setName('');
  };

  const handleRemovePlayer = (id) => {
    setPlayers(players.filter(p => p.id !== id));
  };

  const updateQuantity = (roleId, delta) => {
    setRoleQuantities(prev => {
      const current = prev[roleId] || 0;
      const next = Math.max(0, current + delta);
      
      const newQ = { ...prev };
      if (next === 0) {
        delete newQ[roleId];
      } else {
        newQ[roleId] = next;
      }
      return newQ;
    });
  };

  const handleAddCustomRole = (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    
    const newRole = {
      id: 'custom_' + Date.now(),
      name: newRoleName.trim(),
      team: newRoleTeam
    };
    
    setAllRoles([...allRoles, newRole]);
    updateQuantity(newRole.id, 1);
    setNewRoleName('');
    setShowCustomRoleForm(false);
  };

  const isWarning = totalCards !== players.length;

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-6">
      {/* Cột 1: Người chơi */}
      <div className="flex-1 p-6 bg-card rounded-2xl shadow-xl border border-border flex flex-col">
        <div className="mb-6 border-b border-border pb-4">
          <h2 className="text-2xl font-bold text-foreground mb-1">Người Chơi</h2>
          <p className="text-sm text-gray-500">Đã thêm: <strong className="text-foreground">{players.length}</strong> người</p>
        </div>

        <form onSubmit={handleAddPlayer} className="flex gap-2 mb-6">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên người chơi..."
            className="flex-1 px-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-4 py-2 bg-primary text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <UserPlus size={20} />
          </button>
        </form>

        <div className="flex-1 overflow-y-auto min-h-[200px] content-start">
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {players.map(player => (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  key={player.id}
                  className="flex items-center gap-2 bg-background border border-border px-3 py-1.5 rounded-full text-sm shadow-sm"
                >
                  <span className="font-medium text-foreground">{player.name}</span>
                  <button
                    onClick={() => handleRemovePlayer(player.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors rounded-full p-0.5 hover:bg-red-500/10"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {players.length === 0 && (
              <div className="w-full text-center py-8 text-gray-500 italic">
                Chưa có người chơi nào...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cột 2: Roles tham gia */}
      <div className="flex-[1.5] p-6 bg-card rounded-2xl shadow-xl border border-border flex flex-col">
        <div className="mb-6 border-b border-border pb-4 flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-1">Thẻ Bài (Roles)</h2>
            <p className={cn("text-sm font-medium", isWarning ? "text-red-500" : "text-green-500")}>
              Đã chọn: {totalCards} thẻ {isWarning && `(Cần ${players.length} thẻ)`}
            </p>
          </div>
          <button 
            onClick={() => setShowCustomRoleForm(!showCustomRoleForm)}
            className="px-3 py-1.5 bg-background border border-border hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium text-foreground"
          >
            <Plus size={16} /> Thêm Role
          </button>
        </div>

        {showCustomRoleForm && (
          <form onSubmit={handleAddCustomRole} className="mb-6 p-4 bg-background border border-border rounded-xl space-y-3">
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Tên chức năng (VD: Người ngoài hành tinh)"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            />
            <div className="flex gap-2">
              <select 
                value={newRoleTeam} 
                onChange={(e) => setNewRoleTeam(e.target.value)}
                className="flex-1 p-2 bg-card border border-border rounded-lg text-sm focus:outline-none cursor-pointer"
              >
                <option value="VILLAGER">Phe Dân Làng</option>
                <option value="WEREWOLF">Phe Sói</option>
                <option value="MUTANT">Phe Thứ 3 / Khác</option>
              </select>
              <button
                type="submit"
                disabled={!newRoleName.trim()}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm font-bold"
              >
                Lưu
              </button>
            </div>
          </form>
        )}

        {/* Grid thẻ bài 2:3 */}
        <div className="flex-1 overflow-y-auto max-h-[500px] pr-2">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
            {allRoles.map(role => {
              const qty = roleQuantities[role.id] || 0;
              const isSelected = qty > 0;
              const style = getRoleColor(role.id, role.team);
              
              return (
                <div 
                  key={role.id}
                  className={cn(
                    "relative aspect-[2/3] rounded-xl flex flex-col border-2 overflow-hidden transition-all duration-200 select-none",
                    isSelected ? `${style.bg} ${style.border}` : "bg-background border-border hover:border-gray-400 opacity-60 grayscale"
                  )}
                >
                  <div className={cn(
                    "flex-1 p-2 flex items-center justify-center text-center font-bold text-sm leading-tight",
                    isSelected ? style.whiteText : "text-foreground"
                  )}>
                    {role.name}
                  </div>
                  
                  {/* Điều khiển số lượng */}
                  <div className="bg-black/40 h-10 flex items-center justify-between px-1">
                    <button 
                      onClick={() => updateQuantity(role.id, -1)}
                      className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 rounded transition-colors disabled:opacity-30"
                      disabled={qty === 0}
                    >
                      <Minus size={16} />
                    </button>
                    <span className="text-white font-bold text-sm">{qty}</span>
                    <button 
                      onClick={() => updateQuantity(role.id, 1)}
                      className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 rounded transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border flex justify-end">
          <button
            onClick={onNext}
            disabled={players.length < 3 || isWarning}
            className="px-8 py-3 bg-foreground text-background font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {isWarning ? 'Vui lòng chọn đủ thẻ bài' : 'Gán Bài'}
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
