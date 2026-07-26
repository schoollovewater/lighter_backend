import re

with open('public/index.html', 'r', encoding='utf8') as f:
    content = f.read()

# Replace startNight()
start_night_old = '''    function startNight() {
      const alivePlayers = localWerewolfState.players.filter(p => p.status === \\'Alive\\');
      const effRoles = alivePlayers.map(p => p.cloneInheritedRole || p.role);
      const hasCupidMode2Alive = alivePlayers.some(p => p.isCupid);
      
      let steps = [];
      if (localWerewolfState.day === 1 && (effRoles.includes(\\'CUPID\\') || hasCupidMode2Alive)) steps.push(\\'CUPID\\');
      
      // Clone luA'n thcc d-y nu cAn s
g (ngay c khi A k tha,  ?c thA'ng bAo)
      if (alivePlayers.some(p => p.role === \\'CLONE\\')) steps.push(\\'CLONE\\');
      
      if (effRoles.includes(\\'MOON_LADY\\')) steps.push(\\'MOON_LADY\\');
      if (effRoles.includes(\\'CURSED_ONE\\')) steps.push(\\'CURSED_ONE\\');
      if (effRoles.some(r => [\\'WEREWOLF\\', \\'HIDDEN_WOLF\\', \\'ENRAGED_WOLF\\', \\'SHAMAN_WOLF\\', \\'ALPHA_WOLF\\'].includes(r))) steps.push(\\'WEREWOLF_TEAM\\');
      
      if (effRoles.includes(\\'ALPHA_WOLF\\')) steps.push(\\'ALPHA_WOLF\\');
      if (effRoles.includes(\\'ENRAGED_WOLF\\')) steps.push(\\'ENRAGED_WOLF\\');
      
      if (effRoles.includes(\\'SHAMAN_WOLF\\')) steps.push(\\'SHAMAN_WOLF\\');
      if (effRoles.includes(\\'BODYGUARD\\')) steps.push(\\'BODYGUARD\\');
      if (effRoles.includes(\\'WITCH\\')) steps.push(\\'WITCH\\');
      if (effRoles.includes(\\'BEAR_TAMER\\')) steps.push(\\'BEAR_TAMER\\');
      if (effRoles.includes(\\'SEER\\')) steps.push(\\'SEER\\');
      if (effRoles.includes(\\'DETECTIVE\\')) steps.push(\\'DETECTIVE\\');
      if (localWerewolfState.day === 1 && effRoles.includes(\\'FOOL\\')) steps.push(\\'FOOL\\');
      if (effRoles.includes(\\'HUNTER\\')) steps.push(\\'HUNTER\\');
      if (effRoles.includes(\\'ENRAGED_WOLF\\') && localWerewolfState.enragedWolfStacks > 0) steps.push(\\'ENRAGED_WOLF\\');
      
      localWerewolfState.nightActiveSteps = steps;
      localWerewolfState.currentNightStepIndex = 0;
      localWerewolfState.phase = \\'NIGHT\\';
      socket.emit(\\'sync_game_state\\', localWerewolfState);
      updateWerewolfUI();
    }'''

start_night_new = '''    function startNight() {
      socket.emit('start_night');
    }'''

content = content.replace('    function startNight() {\n      const alivePlayers = localWerewolfState.players.filter(p => p.status === \'Alive\');\n      const effRoles = alivePlayers.map(p => p.cloneInheritedRole || p.role);\n      const hasCupidMode2Alive = alivePlayers.some(p => p.isCupid);\n      \n      let steps = [];\n      if (localWerewolfState.day === 1 && (effRoles.includes(\'CUPID\') || hasCupidMode2Alive)) steps.push(\'CUPID\');\n      \n      // Clone luA\'n thcc d-y nu cAn s
g (ngay c khi A k tha,  ?c thA\'ng bAo)\n      if (alivePlayers.some(p => p.role === \'CLONE\')) steps.push(\'CLONE\');\n      \n      if (effRoles.includes(\'MOON_LADY\')) steps.push(\'MOON_LADY\');\n      if (effRoles.includes(\'CURSED_ONE\')) steps.push(\'CURSED_ONE\');\n      if (effRoles.some(r => [\'WEREWOLF\', \'HIDDEN_WOLF\', \'ENRAGED_WOLF\', \'SHAMAN_WOLF\', \'ALPHA_WOLF\'].includes(r))) steps.push(\'WEREWOLF_TEAM\');\n      \n      if (effRoles.includes(\'ALPHA_WOLF\')) steps.push(\'ALPHA_WOLF\');\n      if (effRoles.includes(\'ENRAGED_WOLF\')) steps.push(\'ENRAGED_WOLF\');\n      \n      if (effRoles.includes(\'SHAMAN_WOLF\')) steps.push(\'SHAMAN_WOLF\');\n      if (effRoles.includes(\'BODYGUARD\')) steps.push(\'BODYGUARD\');\n      if (effRoles.includes(\'WITCH\')) steps.push(\'WITCH\');\n      if (effRoles.includes(\'BEAR_TAMER\')) steps.push(\'BEAR_TAMER\');\n      if (effRoles.includes(\'SEER\')) steps.push(\'SEER\');\n      if (effRoles.includes(\'DETECTIVE\')) steps.push(\'DETECTIVE\');\n      if (localWerewolfState.day === 1 && effRoles.includes(\'FOOL\')) steps.push(\'FOOL\');\n      if (effRoles.includes(\'HUNTER\')) steps.push(\'HUNTER\');\n      if (effRoles.includes(\'ENRAGED_WOLF\') && localWerewolfState.enragedWolfStacks > 0) steps.push(\'ENRAGED_WOLF\');\n      \n      localWerewolfState.nightActiveSteps = steps;\n      localWerewolfState.currentNightStepIndex = 0;\n      localWerewolfState.phase = \'NIGHT\';\n      socket.emit(\'sync_game_state\', localWerewolfState);\n      updateWerewolfUI();\n    }', start_night_new)

# Replace startDayVoting
day_voting_old = '''    function startDayVoting() {
      localWerewolfState.phase = 'DAY_VOTING';
      localWerewolfState.dayVotes = {};
      socket.emit('sync_game_state', localWerewolfState);
      updateWerewolfUI();
    }'''

day_voting_new = '''    function startDayVoting() {
      socket.emit('start_day_voting');
    }'''
content = content.replace(day_voting_old, day_voting_new)

# Replace endWerewolfMatch
end_match_old = '''    function endWerewolfMatch() {
      if (!localWerewolfState) return;
      localWerewolfState.status = 'WAITING';
      socket.emit('sync_game_state', localWerewolfState);
      updateWerewolfUI();
    }'''

end_match_new = '''    function endWerewolfMatch() {
      socket.emit('end_werewolf_game');
    }'''
content = content.replace(end_match_old, end_match_new)

with open('public/index.html', 'w', encoding='utf8') as f:
    f.write(content)
