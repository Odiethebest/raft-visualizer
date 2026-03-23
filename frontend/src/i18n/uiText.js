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
      back: '返回引导页 Back',
      leader: '领导者 Leader',
      node: '节点 node',
      term: '任期 term',
      alive: '存活 alive',
      eventLogToggle: '事件日志 Event Log',
      langToggle: 'EN',
    }
  }
  return {
    title: 'Raft Consensus',
    sub: 'By Odie Yang',
    back: 'Back',
    leader: 'Leader',
    node: 'node',
    term: 'Term',
    alive: 'Alive',
    eventLogToggle: 'Event Log',
    langToggle: 'ZH',
  }
}

export function eventCopy(lang) {
  if (isZh(lang)) {
    return {
      title: '事件日志 EVENT LOG',
      empty: '等待集群事件 Waiting for cluster events...',
    }
  }
  return {
    title: 'EVENT LOG',
    empty: 'Waiting for cluster events...',
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
      noEntries: '— submit a cmd to append the first entry —',
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
    noEntries: '— submit a cmd to append the first entry —',
  }
}

export function controlCopy(lang) {
  if (isZh(lang)) {
    return {
      tutorial: '教程 Tutorial',
      tutorialClose: '关闭教程',
      tutorialTitle: '玩法与命令教程',
      tutorialIntro: '可随时打开，快速查看命令写法、实验路径和可观察到的 Raft 行为。',
      tutorialCmds: '常用 submit cmd 示例',
      tutorialCmdExamples: [
        { cmd: 'set x=1', detail: '追加一条写入日志；多数复制后会显示 committed。' },
        { cmd: 'set y=2', detail: '继续写入可观察 log index 连续递增。' },
        { cmd: 'inc counter', detail: '语义化命令便于区分各次复制与提交。' },
        { cmd: 'transfer node3', detail: '任意字符串都可作为命令载荷参与复制。' },
      ],
      tutorialHow: '推荐玩法',
      tutorialHowItems: [
        '先看当前 Leader、term、commitIndex，再提交 2~3 条命令建立基线。',
        '点击 kill node 杀掉 Leader，观察多数派如何触发新一轮选举。',
        '执行 partition，把集群拆成 2 组，观察少数派无法提交新日志。',
        '执行 heal / restart 后继续 submit cmd，观察日志回补与角色收敛。',
      ],
      tutorialRaft: '这些操作如何体现 Raft',
      tutorialRaftItems: [
        'Leader Election：election timeout 会把 Follower 推进为 Candidate 并请求投票。',
        'Log Replication：只有 Leader 接收客户端命令并用 AppendEntries 复制到 followers。',
        'Safety：已提交日志在 leader 切换后依然保留，体现 leader completeness。',
        'Fault Tolerance：crash、partition、heal、restart 共同展示 quorum 约束。',
      ],
      submitToLeader: '提交命令到 Leader',
      cmdPlaceholder: '例如: set x=1',
      send: '发送 Send',
      submitCmd: '提交命令 submit cmd',
      killNode: '故障注入 kill node',
      killSelecting: '选择目标节点 —',
      restart: '恢复 restart',
      restartSelecting: '选择恢复节点 —',
      partition: '网络分区 partition',
      partitionStepA: '步骤 1 / 2：选择 Group A（可多选）',
      partitionStepB: '步骤 2 / 2：预览分组并确认分区',
      partitionChooseHint: '点击画布节点进行分组；再次点击可取消',
      partitionPreviewA: 'Group A',
      partitionPreviewB: 'Group B',
      confirmGroupA: '确认 Group A',
      heal: '网络恢复 heal',
      healSelecting: '选择要修复的节点 —',
      escHint: 'ESC 取消',
      cancel: '取消 Cancel',
      confirmPartition: '执行分区 Partition',
    }
  }
  return {
    tutorial: 'Tutorial',
    tutorialClose: 'Close Tutorial',
    tutorialTitle: 'How to Play & Command Guide',
    tutorialIntro: 'Open this panel anytime for command patterns, interaction flow, and Raft signals to watch.',
    tutorialCmds: 'Useful submit cmd examples',
    tutorialCmdExamples: [
      { cmd: 'set x=1', detail: 'Appends a write entry; it turns committed after majority replication.' },
      { cmd: 'set y=2', detail: 'Adds a second entry so you can inspect monotonically increasing log indexes.' },
      { cmd: 'inc counter', detail: 'A semantic command that makes replication steps easy to trace in the log.' },
      { cmd: 'transfer node3', detail: 'Any opaque string works; the protocol replicates bytes, not command meaning.' },
    ],
    tutorialHow: 'Recommended interactions',
    tutorialHowItems: [
      'Start by reading leader, term, and commitIndex, then submit 2-3 commands as baseline traffic.',
      'Use kill node on the leader and watch a new election complete with majority voting.',
      'Use partition to split the cluster and verify minority side cannot commit fresh entries.',
      'Use heal or restart, then submit again to observe convergence and log repair.',
    ],
    tutorialRaft: 'How this demonstrates Raft',
    tutorialRaftItems: [
      'Leader Election: election timeout promotes a follower to candidate, then majority grants leadership.',
      'Log Replication: the leader accepts client commands and ships them via AppendEntries.',
      'Safety: committed entries survive leadership changes, showing leader completeness in practice.',
      'Fault Tolerance: crash, partition, heal, and restart expose quorum boundaries and recovery.',
    ],
    submitToLeader: 'Submit command to leader',
    cmdPlaceholder: 'e.g. set x=1',
    send: 'Send',
    submitCmd: 'Submit Cmd',
    killNode: 'Kill Node',
    killSelecting: 'Select target node —',
    restart: 'Restart',
    restartSelecting: 'Select target node —',
    partition: 'Partition',
    partitionStepA: 'Step 1 / 2: select Group A (multi-select)',
    partitionStepB: 'Step 2 / 2: preview groups and confirm',
    partitionChooseHint: 'Click nodes on canvas to toggle Group A membership',
    partitionPreviewA: 'Group A',
    partitionPreviewB: 'Group B',
    confirmGroupA: 'Confirm Group A',
    heal: 'Heal',
    healSelecting: 'Select target node —',
    escHint: 'ESC to cancel',
    cancel: 'Cancel',
    confirmPartition: 'Partition',
  }
}
