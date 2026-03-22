export function isZh(lang) {
  return lang !== 'en'
}

export function roleLabel(role, lang) {
  if (isZh(lang)) {
    if (role === 'leader') return '领导者 Leader'
    if (role === 'candidate') return '候选者 Candidate'
    return '跟随者 Follower'
  }
  if (role === 'leader') return 'Leader'
  if (role === 'candidate') return 'Candidate'
  return 'Follower'
}

export function deadLabel(lang) {
  return isZh(lang) ? '故障 Dead' : 'Offline'
}

export function deadBadgeLabel(lang) {
  return isZh(lang) ? '故障' : 'offline'
}

export function wsStatusLabel(status, lang) {
  const zh = {
    connected: '已连接 Connected',
    connecting: '连接中 Connecting',
    reconnecting: '重连中 Reconnecting',
  }
  const en = {
    connected: 'Connected',
    connecting: 'Connecting',
    reconnecting: 'Reconnecting',
  }
  const dict = isZh(lang) ? zh : en
  return dict[status] ?? status
}

export function formatEvent(event, lang) {
  const zh = isZh(lang)
  switch (event.kind) {
    case 'role_changed':
      return zh
        ? `节点 node ${event.nodeId} 切换为 ${roleLabel(event.role, lang)}（term ${event.term}）`
        : `Node ${event.nodeId} became ${roleLabel(event.role, lang)} (term ${event.term})`
    case 'term_changed':
      return zh
        ? `节点 node ${event.nodeId} 任期 term -> ${event.term}`
        : `Node ${event.nodeId} term -> ${event.term}`
    case 'node_killed':
      return zh
        ? `节点 node ${event.nodeId} 已 kill（故障）`
        : `Node ${event.nodeId} was killed`
    case 'node_restarted':
      return zh
        ? `节点 node ${event.nodeId} 已 restart（恢复）`
        : `Node ${event.nodeId} restarted`
    case 'commit_advanced':
      return zh
        ? `节点 node ${event.nodeId} 提交位点 commit -> ${event.commitIndex}`
        : `Node ${event.nodeId} commit index -> ${event.commitIndex}`
    default:
      return zh ? '集群事件 Cluster event' : 'Cluster event'
  }
}

export function appCopy(lang) {
  if (isZh(lang)) {
    return {
      title: 'Raft 共识 Raft Consensus',
      sub: '作者 Odie Yang',
      leader: '领导者 Leader',
      node: '节点 node',
      term: '任期 term',
      alive: '存活 alive',
      guide: '玩法教程 Guide',
      langToggle: 'EN',
    }
  }
  return {
    title: 'Raft Consensus',
    sub: 'By Odie Yang',
    leader: 'Leader',
    node: 'node',
    term: 'Term',
    alive: 'Alive',
    guide: 'Guide',
    langToggle: '中文',
  }
}

export function eventCopy(lang) {
  if (isZh(lang)) {
    return {
      title: '事件流 Events',
      empty: '等待集群活动 Waiting for cluster activity...',
    }
  }
  return {
    title: 'Events',
    empty: 'Waiting for cluster activity...',
  }
}

export function logCopy(lang) {
  if (isZh(lang)) {
    return {
      nodeStats: '节点状态 Node Stats',
      role: '角色 Role',
      term: '任期 Term',
      commit: '提交 Commit',
      votedFor: '投票给 Voted For',
      clickNode: '点击节点查看状态 Click a node to inspect state',
      logEntries: '日志条目 Log Entries',
      noEntries: '暂无日志 no entries yet（可先 submit cmd）',
    }
  }
  return {
    nodeStats: 'Node Stats',
    role: 'Role',
    term: 'Term',
    commit: 'Commit',
    votedFor: 'Voted For',
    clickNode: 'Click a node to inspect state',
    logEntries: 'Log Entries',
    noEntries: 'No entries yet (submit a command to the leader)',
  }
}

export function controlCopy(lang) {
  if (isZh(lang)) {
    return {
      pickKill: '选择要 kill 的节点 Select node to kill',
      pickRestart: '选择要 restart 的节点 Select node to restart',
      submitToLeader: '提交命令到 Leader',
      cmdPlaceholder: '例如: set x=1',
      send: '发送 Send',
      submitCmd: '提交命令 submit cmd',
      killNode: '故障注入 kill node',
      restart: '恢复 restart',
      partition: '网络分区 partition',
      heal: '网络恢复 heal',
      cancel: '取消 Cancel',
      groupA: '分组 group A',
      groupB: '分组 group B',
      confirmPartition: '执行分区 Partition',
    }
  }
  return {
    pickKill: 'Select node to kill',
    pickRestart: 'Select node to restart',
    submitToLeader: 'Submit command to leader',
    cmdPlaceholder: 'e.g. set x=1',
    send: 'Send',
    submitCmd: 'Submit Cmd',
    killNode: 'Kill Node',
    restart: 'Restart',
    partition: 'Partition',
    heal: 'Heal',
    cancel: 'Cancel',
    groupA: 'Group A',
    groupB: 'Group B',
    confirmPartition: 'Partition',
  }
}
