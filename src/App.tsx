/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeroScene } from './components/HeroScene';
import { EventLoop3D } from './components/EventLoop3D';
import { 
  Cpu, 
  Layers, 
  RefreshCw, 
  Clock, 
  Zap, 
  Database, 
  Network, 
  FileCode, 
  ArrowRight,
  Info,
  ChevronRight,
  Activity,
  Terminal,
  Play,
  AlertCircle,
  HardDrive,
  ShieldCheck
} from 'lucide-react';

// --- Types ---

interface Phase {
  id: string;
  name: string;
  description: string;
  details: string[];
  seniorInsights: string[];
  color: string;
  icon: React.ReactNode;
  code: string;
}

interface ArchPart {
  id: string;
  name: string;
  description: string;
  insights: string[];
  color: string;
  icon: React.ReactNode;
}

// --- Constants ---

const ARCH_PARTS: ArchPart[] = [
  {
    id: 'v8',
    name: 'V8 Context',
    description: 'JavaScript engine by Google. Uses a multi-stage pipeline — Ignition interprets JS as bytecode first; only hot functions are JIT-compiled to native machine code by TurboFan.',
    insights: [
      'Ignition: Bytecode interpreter — all JS runs through Ignition first, producing compact bytecode before any optimization.',
      'TurboFan: Optimizing JIT compiler — profiling data from Ignition identifies hot functions to re-compile as native code.',
      'Sparkplug (Node 16+): A fast non-optimizing baseline compiler between Ignition and TurboFan that reduces JIT latency.',
      'Hidden Classes: V8 creates internal "shapes" to make property access on dynamic objects as fast as C++ struct access.',
      'Memory Heap: New Space (Young Gen, Scavenge GC — fast minor collections) and Old Space (Old Gen, Mark-Compact GC).',
      'Write Barriers: Track cross-generational object references so the incremental/concurrent GC never misses live objects.'
    ],
    color: 'from-yellow-400 to-orange-500',
    icon: <Cpu className="w-6 h-6" />
  },
  {
    id: 'bindings',
    name: 'Node Bindings',
    description: 'The C++ bridge between JavaScript and OS libraries. Sits between Node\'s built-in JS modules (lib/) and the underlying Libuv/V8 C++ layer.',
    insights: [
      'JS Layer (lib/): Built-in modules like fs.js, net.js, http.js are written in JavaScript and live above the C++ layer.',
      'internalBinding(): The modern API (replaced deprecated process.binding()) used by lib/ to reach C++ built-in modules.',
      'C++ Wrappers: Classes like TCPWrap, FSReqCallback, and StreamWrap bind Libuv handles to JS objects.',
      'Buffer Management: Zero-copy data sharing between the JS heap and C++ via ArrayBuffer / BackingStore.',
      'N-API / node-addon-api: ABI-stable native addon interface — addons compiled once run across Node versions.'
    ],
    color: 'from-green-400 to-emerald-600',
    icon: <Activity className="w-6 h-6" />
  },
  {
    id: 'event-loop',
    name: 'Event Loop',
    description: 'The single-threaded orchestrator. It manages asynchronous tasks and executes their callbacks.',
    insights: [
      'uv_run: The entry point that starts the infinite loop.',
      'Handle vs Request: Handles are persistent (sockets), Requests are short-lived (file read).',
      'I/O Polling: Using epoll (Linux), kqueue (macOS), or IOCP (Windows).',
      'Loop iteration: One full pass through all phases. Do not confuse with process.nextTick() — that is a microtask hook, not a loop phase.'
    ],
    color: 'from-blue-400 to-indigo-600',
    icon: <RefreshCw className="w-6 h-6" />
  },
  {
    id: 'thread-pool',
    name: 'Thread Pool',
    description: 'OS-level threads inside Libuv that execute blocking operations so the main event loop thread is never stalled waiting on the kernel.',
    insights: [
      'What uses it: fs.* calls, dns.lookup() (getaddrinfo), crypto (pbkdf2, scrypt, randomBytes), and uv_queue_work().',
      'dns.resolve() does NOT use the thread pool — it uses c-ares, a fully async DNS library with its own event handling.',
      'Default size is 4 threads. Set UV_THREADPOOL_SIZE=N (max 1024) before Node starts to scale I/O-heavy apps.',
      'Completion signalling: threads notify the event loop via an internal pipe or eventfd — not OS signals.',
      'Not node:worker_threads — that module creates isolated V8 contexts with their own heaps, GC, and event loops.'
    ],
    color: 'from-purple-400 to-pink-600',
    icon: <HardDrive className="w-6 h-6" />
  }
];

const EVENT_LOOP_PHASES: Phase[] = [
  {
    id: 'timers',
    name: 'Timers',
    description: 'Executes callbacks scheduled by setTimeout() and setInterval().',
    details: [
      'Checks if any timer has expired.',
      'Executes the callback if the threshold is reached.',
      'Timers are not exact; they are "at least" after X ms.'
    ],
    seniorInsights: [
      'Timers are stored in a min-heap data structure for O(1) access to the next expiring timer.',
      'Node.js actually uses a "timer list" for timers with the same duration to optimize performance.',
      'The loop will block in the Poll phase for the duration of the next timer if no other work exists.'
    ],
    color: 'text-yellow-400',
    icon: <Clock className="w-5 h-5" />,
    code: `setTimeout(() => {\n  console.log('Timer expired!');\n}, 100);`
  },
  {
    id: 'pending',
    name: 'Pending Callbacks',
    description: 'Executes OS-level callbacks that Libuv intentionally deferred to the next loop iteration — not a spillover from Poll.',
    details: [
      'Specifically handles deferred system error callbacks, not general I/O overflow.',
      'Example: TCP ECONNREFUSED on Linux/macOS is reported one full iteration after it occurs.'
    ],
    seniorInsights: [
      'This is deliberate Libuv design: the OS requires an extra tick to finalize certain error states before reporting them.',
      'TCP ECONNREFUSED is the canonical example — some *nix systems finalize the error state asynchronously after the current iteration ends.',
      'Rarely encountered in application code directly, but critical for low-level network library authors handling raw socket errors.'
    ],
    color: 'text-purple-400',
    icon: <Activity className="w-5 h-5" />,
    code: `// Internal system callbacks\n// e.g., TCP connection errors`
  },
  {
    id: 'idle-prepare',
    name: 'Idle / Prepare',
    description: 'Internal Libuv phase — no user-facing API. Runs registered idle and prepare handles before I/O polling begins.',
    details: [
      'No JavaScript API exists for this phase — it is entirely internal to Libuv.',
      'Node.js uses the prepare hook to track outstanding async operations and manage loop lifecycle.',
      'Shown here for completeness: the official event loop has 6 phases, not 5.'
    ],
    seniorInsights: [
      'uv__run_idle() and uv__run_prepare() iterate their handle lists in sequence before the Poll phase.',
      'Node.js registers a prepare handle (node::BeforeExit) to determine whether the loop should keep running or exit.',
      'If you read Libuv source (src/unix/core.c), UV_RUN_DEFAULT loops through all 6 phase groups including idle/prepare.'
    ],
    color: 'text-white/30',
    icon: <Layers className="w-5 h-5" />,
    code: `// No user-facing API for this phase.\n// Libuv prepare handles run here.\n// Node uses it internally to decide\n// whether the loop should continue.`
  },
  {
    id: 'poll',
    name: 'Poll',
    description: 'The most important phase. Retrieves new I/O events and executes callbacks.',
    details: [
      'Calculates how long it should block and poll for I/O.',
      'Executes scripts in the poll queue.',
      'If the queue is empty, it might wait for I/O or move to the Check phase.'
    ],
    seniorInsights: [
      'The Poll phase has two main functions: calculating how long it should block for I/O, and processing events in the poll queue.',
      'If the poll queue is empty, the loop will check if any setImmediate() scripts exist. If so, it moves to the Check phase.',
      'If no setImmediate() exists, it will wait for callbacks to be added to the queue, then execute them immediately.'
    ],
    color: 'text-blue-400',
    icon: <Network className="w-5 h-5" />,
    code: `fs.readFile('data.txt', (err, data) => {\n  console.log('File read complete!');\n});`
  },
  {
    id: 'check',
    name: 'Check',
    description: 'Executes setImmediate() callbacks.',
    details: [
      'setImmediate() is designed to execute a script once the current Poll phase completes.',
      'Always runs after the Poll phase.'
    ],
    seniorInsights: [
      'setImmediate() is NOT a timer — callbacks sit in a simple FIFO check queue, not the timer min-heap.',
      'If called from within an I/O callback, setImmediate() always runs before any pending setTimeout() that iteration.',
      'Preferred over setTimeout(fn, 0): no O(log n) min-heap insertion, no threshold comparison — it just queues.',
      'Safe for recursive async work: each call yields back to the event loop, unlike nextTick() which can starve it.'
    ],
    color: 'text-green-400',
    icon: <ShieldCheck className="w-5 h-5" />,
    code: `setImmediate(() => {\n  console.log('Immediate execution!');\n});`
  },
  {
    id: 'close',
    name: 'Close Callbacks',
    description: 'Executes callbacks for closed connections or handles.',
    details: [
      'Example: socket.on("close", ...).',
      'Final cleanup before the next iteration.'
    ],
    seniorInsights: [
      'If a socket or handle is closed abruptly (e.g. socket.destroy()), the "close" event will be emitted here.',
      'This is the last chance to clean up resources before the loop starts over.',
      'It ensures that "close" events are processed in a predictable order.'
    ],
    color: 'text-red-400',
    icon: <RefreshCw className="w-5 h-5" />,
    code: `socket.on('close', () => {\n  console.log('Socket closed!');\n});`
  }
];

// --- Helpers ---

function highlightJS(code: string): React.ReactNode[] {
  const tokens: { text: string; cls: string }[] = [];
  const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:const|let|var|function|return|if|else|new|this|class|import|export|from|async|await|of|in|typeof|void)\b)|(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)/g;
  const builtinRegex = /\b(process|setTimeout|setInterval|setImmediate|Promise|console|fs|socket|require|module)\b/g;
  const literalRegex = /\b(true|false|null|undefined)\b/g;
  const numberRegex = /\b(\d+)\b/g;

  // Run all regexes together via a combined pattern
  const combined = new RegExp(
    [
      /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/.source,     // [1] strings
      /(\b(?:const|let|var|function|return|if|else|new|this|class|import|export|from|async|await|of|in|typeof|void)\b)/.source, // [2] keywords
      /(\/\/[^\n]*)/.source,                                                   // [3] line comment
      /(\/\*[\s\S]*?\*\/)/.source,                                             // [4] block comment
      /\b(process|setTimeout|setInterval|setImmediate|Promise|console|fs|socket|require|module)\b/.source, // [5] builtins
      /\b(true|false|null|undefined)\b/.source,                               // [6] literals
      /\b(\d+)\b/.source,                                                      // [7] numbers
    ].join('|'),
    'g'
  );

  // suppress unused var warnings
  void regex; void builtinRegex; void literalRegex; void numberRegex;

  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = combined.exec(code)) !== null) {
    if (m.index > last) tokens.push({ text: code.slice(last, m.index), cls: 'text-white/70' });
    if      (m[1]) tokens.push({ text: m[0], cls: 'text-emerald-300' });
    else if (m[2]) tokens.push({ text: m[0], cls: 'text-purple-400' });
    else if (m[3] || m[4]) tokens.push({ text: m[0], cls: 'text-white/30 italic' });
    else if (m[5]) tokens.push({ text: m[0], cls: 'text-yellow-300' });
    else if (m[6]) tokens.push({ text: m[0], cls: 'text-blue-400' });
    else if (m[7]) tokens.push({ text: m[0], cls: 'text-orange-400' });
    else tokens.push({ text: m[0], cls: 'text-white/70' });
    last = m.index + m[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), cls: 'text-white/70' });
  return tokens.map((t, i) => <span key={i} className={t.cls}>{t.text}</span>);
}

// --- Sub-components ---

const NAV_LINKS = [
  { id: 'architecture', label: '01 Architecture' },
  { id: 'event-loop',   label: '02 Event Loop'   },
  { id: 'microtasks',   label: '03 Microtasks'   },
];

const StickyNav = ({ scrollToSection }: { scrollToSection: (id: string) => void }) => {
  const [activeId, setActiveId] = useState<string>('architecture');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    NAV_LINKS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 md:px-12 h-12 flex items-center gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <RefreshCw className="w-3.5 h-3.5 text-green-500 animate-spin-slow" />
          <span className="hidden sm:block text-[10px] font-mono text-white/30 uppercase tracking-[0.25em]">
            Node.js Internals
          </span>
        </div>
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${
                activeId === id
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};

const MICROTASK_QUEUES = [
  {
    label: 'process.nextTick Queue',
    badge: 'Priority 1 — Highest',
    border: 'border-yellow-400/30',
    bg: 'bg-yellow-400/5',
    textColor: 'text-yellow-400',
    badgeStyle: 'bg-yellow-400 text-black',
    itemStyle: 'text-yellow-200/60 border-yellow-400/20',
    dividerColor: 'bg-yellow-400/30',
    items: ['process.nextTick(fn)', 'nextTick(fn)', '…drains completely first'],
  },
  {
    label: 'Promise Microtask Queue',
    badge: 'Priority 2',
    border: 'border-blue-400/30',
    bg: 'bg-blue-400/5',
    textColor: 'text-blue-400',
    badgeStyle: 'bg-blue-500 text-white',
    itemStyle: 'text-blue-200/60 border-blue-400/20',
    dividerColor: 'bg-blue-400/30',
    items: ['Promise.then()', '.catch()', '.finally()', 'queueMicrotask(fn)'],
  },
  {
    label: 'Event Loop — Macrotasks',
    badge: 'Priority 3 — Normal',
    border: 'border-white/15',
    bg: 'bg-white/5',
    textColor: 'text-white/70',
    badgeStyle: 'bg-white/15 text-white/60',
    itemStyle: 'text-white/40 border-white/10',
    dividerColor: 'bg-white/20',
    items: ['setTimeout / setInterval', 'setImmediate', 'I/O callbacks'],
  },
];

const MicrotaskQueues = () => (
  <div className="space-y-1">
    {MICROTASK_QUEUES.map((q, i) => (
      <div key={q.label}>
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`rounded-xl border p-3 md:p-4 ${q.border} ${q.bg}`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className={`text-xs font-bold ${q.textColor}`}>{q.label}</span>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${q.badgeStyle}`}>
              {q.badge}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {q.items.map((item) => (
              <span key={item} className={`text-[10px] font-mono px-2 py-1 rounded-md bg-black/30 border ${q.itemStyle}`}>
                {item}
              </span>
            ))}
          </div>
        </motion.div>
        {i < MICROTASK_QUEUES.length - 1 && (
          <div className="flex justify-center py-0.5">
            <div className="flex flex-col items-center gap-0.5">
              <div className={`w-px h-3 ${q.dividerColor}`} />
              <ArrowRight className="w-2.5 h-2.5 text-white/20 rotate-90" />
              <span className="text-[9px] text-white/20 font-mono">drains first</span>
            </div>
          </div>
        )}
      </div>
    ))}
  </div>
);

const EXECUTION_ORDER = [
  { step: '1', label: 'Synchronous Code',        sub: 'call stack runs to empty',      textCls: 'text-white',       borderCls: 'border-white/20',       bgCls: 'bg-white/5'        },
  { step: '2', label: 'process.nextTick()',       sub: 'entire queue drains first',     textCls: 'text-yellow-400',  borderCls: 'border-yellow-400/30',  bgCls: 'bg-yellow-400/5'   },
  { step: '3', label: 'Promise callbacks',        sub: '.then / .catch / .finally',     textCls: 'text-blue-400',    borderCls: 'border-blue-400/30',    bgCls: 'bg-blue-400/5'     },
  { step: '4', label: 'setTimeout / setInterval', sub: 'Timers phase (macrotask)',      textCls: 'text-orange-400',  borderCls: 'border-orange-400/30',  bgCls: 'bg-orange-400/5'   },
  { step: '5', label: 'setImmediate()',           sub: 'Check phase — after I/O poll',  textCls: 'text-green-400',   borderCls: 'border-green-400/30',   bgCls: 'bg-green-400/5'    },
];

const ExecutionOrderCard = () => (
  <div className="bg-white/5 rounded-2xl border border-white/10 p-5 md:p-6">
    <div className="flex items-center gap-2 mb-4">
      <ArrowRight className="w-4 h-4 text-green-400" />
      <span className="text-xs font-black uppercase tracking-widest text-white/50">Execution Order</span>
    </div>
    <div className="space-y-1.5">
      {EXECUTION_ORDER.map(({ step, label, sub, textCls, borderCls, bgCls }, i) => (
        <React.Fragment key={step}>
          <div className={`flex items-center gap-3 p-2.5 rounded-xl border font-mono ${borderCls} ${bgCls}`}>
            <span className={`text-[10px] font-black w-5 text-center opacity-50 shrink-0 ${textCls}`}>{step}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold truncate ${textCls}`}>{label}</p>
              <p className="text-[10px] text-white/30 truncate">{sub}</p>
            </div>
          </div>
          {i < EXECUTION_ORDER.length - 1 && (
            <div className="pl-4 text-white/15 text-xs font-mono leading-none">↓</div>
          )}
        </React.Fragment>
      ))}
    </div>
  </div>
);

// --- Components ---

const EventLoopPhase = ({ phase, isActive, onClick }: { phase: Phase, isActive: boolean, onClick: () => void, key?: string }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`w-full text-left p-3 md:p-4 rounded-xl border transition-all duration-300 relative overflow-hidden ${
      isActive 
        ? `bg-white/10 border-white/30 shadow-lg shadow-black/20` 
        : 'bg-white/5 border-white/5 hover:border-white/10'
    }`}
  >
    {isActive && (
      <motion.div 
        layoutId="active-bg" 
        className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent pointer-events-none" 
      />
    )}
    <div className="flex items-center justify-between mb-1 md:mb-2 relative z-10">
      <div className={`p-1.5 md:p-2 rounded-lg bg-black/30 ${phase.color}`}>
        {phase.icon}
      </div>
      {isActive && (
        <motion.div layoutId="active-indicator" className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white shadow-[0_0_8px_white]" />
      )}
    </div>
    <h4 className={`font-bold text-sm md:text-base relative z-10 ${isActive ? 'text-white' : 'text-white/70'}`}>{phase.name}</h4>
    <p className="text-xs text-white/50 line-clamp-2 relative z-10">{phase.description}</p>
  </motion.button>
);

export default function App() {
  const [activePhase, setActivePhase] = useState<Phase>(EVENT_LOOP_PHASES[0]);
  const [loopIndex, setLoopIndex] = useState(0);
  const [isAutoLooping, setIsAutoLooping] = useState(true);
  const [logs, setLogs] = useState<{ msg: string; type: string }[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedArchPart, setSelectedArchPart] = useState<ArchPart | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAutoLooping && !isExecuting) {
      interval = setInterval(() => {
        setLoopIndex((prev) => (prev + 1) % EVENT_LOOP_PHASES.length);
      }, 6000); // Slower loop for reading
    }
    return () => clearInterval(interval);
  }, [isAutoLooping, isExecuting]);

  const runSimulation = useCallback(() => {
    setIsExecuting(true);
    setLogs([]);
    
    const addLog = (msg: string, type: string = 'info', delay: number = 0) => {
      setTimeout(() => {
        setLogs(prev => [...prev, { msg, type }]);
      }, delay);
    };

    addLog('🚀 Starting Node.js Process...', 'system', 0);
    addLog('📦 Loading V8 Engine...', 'system', 500);
    addLog('🔄 Initializing Libuv Event Loop...', 'system', 1000);
    
    // Simulate current phase execution
    addLog(`📍 Entering ${activePhase.name} phase...`, 'phase', 1500);
    
    if (activePhase.id === 'timers') {
      addLog('🔍 Inspecting min-heap for expired timers...', 'info', 2000);
      addLog('✅ Timer threshold reached: 100ms ≥ 100ms', 'success', 2500);
      addLog('📝 Executing: console.log("Timer expired!")', 'code', 3000);
      addLog('> Timer expired!', 'output', 3200);
      addLog('🔄 nextTick + Promise queues drained before next phase.', 'info', 3600);
    } else if (activePhase.id === 'pending') {
      addLog('🔍 Checking deferred OS callback queue...', 'info', 2000);
      addLog('⚠️  Found: TCP ECONNREFUSED (deferred from prev. iteration)', 'info', 2500);
      addLog('📝 Executing: socket error callback...', 'code', 3000);
      addLog('> Error: connect ECONNREFUSED 127.0.0.1:3000', 'output', 3200);
    } else if (activePhase.id === 'idle-prepare') {
      addLog('⚙️  Running Libuv prepare handles...', 'info', 2000);
      addLog('📊 node::BeforeExit — checking pending async ops...', 'info', 2500);
      addLog('✅ Async ops still pending — loop continues.', 'success', 3000);
      addLog('➡️  Handing off to Poll phase.', 'info', 3200);
    } else if (activePhase.id === 'poll') {
      addLog('📡 Calling epoll_wait() / kqueue — blocking for I/O...', 'info', 2000);
      addLog('📥 Kernel event received: fs.readFile complete', 'success', 2500);
      addLog('📝 Executing I/O callback...', 'code', 3000);
      addLog('> File read complete!', 'output', 3200);
      addLog('🔄 nextTick + Promise queues drained before Check phase.', 'info', 3600);
    } else if (activePhase.id === 'check') {
      addLog('🔍 Inspecting setImmediate FIFO queue...', 'info', 2000);
      addLog('✅ Found setImmediate callback (no heap lookup needed)', 'success', 2500);
      addLog('📝 Executing: console.log("Immediate execution!")', 'code', 3000);
      addLog('> Immediate execution!', 'output', 3200);
    } else if (activePhase.id === 'close') {
      addLog('🔌 Checking close callback queue...', 'info', 2000);
      addLog('✅ Found: socket "close" event (abrupt destroy)', 'success', 2500);
      addLog('📝 Executing: socket.on("close", cb)', 'code', 3000);
      addLog('> Socket closed — resources cleaned up.', 'output', 3200);
      addLog('🔄 Loop iteration complete. Returning to Timers phase.', 'info', 3600);
    } else {
      addLog('ℹ️  Processing phase callbacks...', 'info', 2000);
      addLog('✅ Phase complete.', 'success', 2500);
    }

    setTimeout(() => setIsExecuting(false), 4000);
  }, [activePhase]);

  useEffect(() => {
    setActivePhase(EVENT_LOOP_PHASES[loopIndex]);
  }, [loopIndex]);

  useEffect(() => {
    // Automatically run simulation when activePhase changes
    runSimulation();
  }, [activePhase, runSimulation]);

  useEffect(() => {
    if (logEndRef.current) {
      const container = logEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [logs]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-purple-500/30">

      {/* ─── HERO: Full-screen 3D cinematic landing ─────────────────────────── */}
      <section id="top" className="relative h-screen overflow-hidden bg-black">
        <HeroScene />

        {/* Text overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 px-6">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="text-center"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-green-400 font-mono text-[10px] md:text-xs tracking-[0.45em] uppercase mb-5"
            >
              ◉ &nbsp;Node.js Internals &nbsp;◉
            </motion.div>

            <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-[9rem] font-black tracking-tighter leading-[0.85] mb-6">
              THE{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-300 to-blue-500">
                EVENT LOOP
              </span>
              <br />
              <span className="text-white/12">UNMASKED</span>
            </h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-white/40 text-sm md:text-lg max-w-xl mx-auto leading-relaxed font-light mb-10"
            >
              An interactive 3D journey through Node.js architecture —
              from the V8 engine to Libuv's event loop.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="pointer-events-auto flex flex-col items-center gap-4"
            >
              <button
                onClick={() => scrollToSection('architecture')}
                className="px-8 py-3 rounded-full border border-green-500/40 text-green-400 text-xs font-mono tracking-[0.3em] uppercase hover:bg-green-500/10 hover:border-green-400/70 transition-all duration-300"
              >
                Begin Journey
              </button>
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="text-white/20 text-xl"
              >
                ↓
              </motion.div>
            </motion.div>
          </motion.div>
        </div>

        {/* Floating labels for the 4 architecture components */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {[
            { label: 'V8 Engine',      sub: 'JavaScript Runtime',  pos: 'top-[18%] right-[10%]', color: 'text-blue-400',   border: 'border-blue-500/30',   bg: 'bg-blue-500/5'   },
            { label: 'Node Bindings',  sub: 'C++ Bridge',          pos: 'top-[22%] left-[8%]',   color: 'text-emerald-400',border: 'border-emerald-500/30',bg: 'bg-emerald-500/5'},
            { label: 'Libuv',          sub: 'Event Loop Core',     pos: 'bottom-[28%] left-[8%]',color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/5' },
            { label: 'Thread Pool',    sub: 'UV_THREADPOOL_SIZE=4', pos: 'bottom-[24%] right-[9%]',color:'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/5' },
          ].map(({ label, sub, pos, color, border, bg }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className={`absolute hidden md:block ${pos}`}
            >
              <div className={`px-3 py-2 rounded-xl border ${border} ${bg} backdrop-blur-sm`}>
                <div className={`text-[10px] font-black tracking-widest uppercase ${color}`}>{label}</div>
                <div className="text-[9px] text-white/30 font-mono mt-0.5">{sub}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom fade into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none z-20" />
      </section>

      <StickyNav scrollToSection={scrollToSection} />

      <main className="max-w-6xl mx-auto px-4 md:px-12 py-12 md:py-20 space-y-20 md:space-y-32">
        
        {/* Section 1: Architecture Redesign */}
        <section id="architecture">
          <div className="flex items-center gap-3 mb-8 md:mb-12">
            <div className="w-1 h-8 bg-purple-500 rounded-full" />
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">System Architecture</h2>
          </div>
          
          <div className="relative bg-white/5 rounded-[2rem] md:rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl shadow-black">
            <div className="grid md:grid-cols-12 items-stretch min-h-[500px] md:min-h-[600px]">
              {/* Visual Diagram */}
              <div className="md:col-span-7 p-6 md:p-12 flex items-center justify-center relative bg-black/20">
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_30%,_var(--tw-gradient-stops))] from-green-500/20 via-transparent to-transparent blur-3xl" />
                  <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_70%_70%,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent blur-3xl" />
                </div>

                {/* The Stack */}
                <div className="relative z-10 w-full max-w-md space-y-0 flex flex-col items-center scale-[0.85] sm:scale-90 md:scale-100">
                  {/* JS App Layer */}
                  <motion.div 
                    whileHover={{ scale: 1.02, y: -5 }}
                    className="w-full h-20 md:h-24 bg-yellow-400/10 border-2 border-yellow-400/30 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center gap-1 cursor-pointer group relative shadow-[0_0_30px_rgba(250,204,21,0.1)]"
                    onClick={() => setSelectedArchPart(ARCH_PARTS.find(p => p.id === 'v8') || null)}
                  >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-yellow-400 text-black text-[10px] sm:text-xs font-black rounded-full opacity-0 group-hover:opacity-100 transition-opacity">JS ENGINE</div>
                    <FileCode className="w-5 h-5 md:w-6 md:h-6 text-yellow-500 group-hover:scale-110 transition-transform" />
                    <span className="font-mono text-[10px] sm:text-xs text-yellow-500 font-black tracking-widest">V8 CONTEXT</span>
                  </motion.div>

                  {/* Connection Pipe */}
                  <div className="w-1 h-8 md:h-12 bg-gradient-to-b from-yellow-400/30 via-white/10 to-green-400/30 relative">
                    <motion.div 
                      animate={{ y: [0, 32], opacity: [0, 1, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full blur-[2px]"
                    />
                  </div>

                  {/* Bindings Layer */}
                  <motion.div 
                    whileHover={{ scale: 1.02, y: -5 }}
                    className="w-full h-20 md:h-24 bg-green-400/10 border-2 border-green-400/30 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center gap-1 cursor-pointer group relative shadow-[0_0_30px_rgba(74,222,128,0.1)]"
                    onClick={() => setSelectedArchPart(ARCH_PARTS.find(p => p.id === 'bindings') || null)}
                  >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-400 text-black text-[10px] sm:text-xs font-black rounded-full opacity-0 group-hover:opacity-100 transition-opacity">C++ BRIDGE</div>
                    <Activity className="w-5 h-5 md:w-6 md:h-6 text-green-500 group-hover:scale-110 transition-transform" />
                    <span className="font-mono text-[10px] sm:text-xs text-green-500 font-black tracking-widest">NODE BINDINGS</span>
                  </motion.div>

                  {/* Connection Pipe */}
                  <div className="w-1 h-8 md:h-12 bg-gradient-to-b from-green-400/30 via-white/10 to-blue-400/30 relative">
                    <motion.div 
                      animate={{ y: [0, 32], opacity: [0, 1, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 1 }}
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full blur-[2px]"
                    />
                  </div>

                  {/* Core Engines - Side by Side */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 w-full">
                    <motion.div 
                      whileHover={{ scale: 1.05, y: -5 }}
                      className="h-28 sm:h-32 md:h-44 bg-purple-500/10 border-2 border-purple-500/30 rounded-2xl md:rounded-[2rem] flex flex-col items-center justify-center gap-1 sm:gap-2 md:gap-3 cursor-pointer group shadow-lg shadow-purple-900/20 relative overflow-hidden"
                      onClick={() => setSelectedArchPart(ARCH_PARTS.find(p => p.id === 'event-loop') || null)}
                    >
                      <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="p-2 sm:p-3 md:p-4 rounded-xl md:rounded-2xl bg-purple-500/20 text-purple-400 relative z-10">
                        <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 group-hover:rotate-180 transition-transform duration-1000" />
                      </div>
                      <span className="font-mono text-[9px] sm:text-[10px] md:text-xs text-purple-400 font-black tracking-widest relative z-10 text-center px-1">LIBUV LOOP</span>
                    </motion.div>
                    
                    <motion.div 
                      whileHover={{ scale: 1.05, y: -5 }}
                      className="h-28 sm:h-32 md:h-44 bg-blue-500/10 border-2 border-blue-500/30 rounded-2xl md:rounded-[2rem] flex flex-col items-center justify-center gap-1 sm:gap-2 md:gap-3 cursor-pointer group shadow-lg shadow-blue-900/20 relative overflow-hidden"
                      onClick={() => setSelectedArchPart(ARCH_PARTS.find(p => p.id === 'thread-pool') || null)}
                    >
                      <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="p-2 sm:p-3 md:p-4 rounded-xl md:rounded-2xl bg-blue-500/20 text-blue-400 relative z-10">
                        <HardDrive className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 group-hover:scale-110 transition-transform" />
                      </div>
                      <span className="font-mono text-[9px] sm:text-[10px] md:text-xs text-blue-400 font-black tracking-widest relative z-10 text-center px-1">THREAD POOL</span>
                    </motion.div>
                  </div>
                </div>

                {/* Mobile/Tablet Overlay for Details */}
                <AnimatePresence>
                  {selectedArchPart && (
                    <motion.div
                      initial={{ opacity: 0, y: 100 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 100 }}
                      className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl p-6 md:p-12 md:hidden flex flex-col"
                    >
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl bg-gradient-to-br ${selectedArchPart.color} text-black`}>
                            {selectedArchPart.icon}
                          </div>
                          <h3 className="text-xl font-black">{selectedArchPart.name}</h3>
                        </div>
                        <button 
                          onClick={() => setSelectedArchPart(null)}
                          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        >
                          <Zap className="w-5 h-5 rotate-45" />
                        </button>
                      </div>
                      
                      <p className="text-white/70 text-sm leading-relaxed mb-8">
                        {selectedArchPart.description}
                      </p>

                      <div className="space-y-3 overflow-y-auto flex-1 pr-2 scrollbar-hide">
                        {selectedArchPart.insights.map((insight, i) => (
                          <div key={i} className="flex gap-3 items-start p-4 rounded-xl bg-white/5 border border-white/5">
                            <ChevronRight className="w-4 h-4 mt-0.5 text-white/20 shrink-0" />
                            <p className="text-sm text-white/60 leading-relaxed">{insight}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Desktop Sidebar Details */}
              <div className="hidden md:block md:col-span-5 border-l border-white/10 bg-white/[0.02]">
                <AnimatePresence mode="wait">
                  {selectedArchPart ? (
                    <motion.div
                      key={selectedArchPart.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-12 h-full flex flex-col"
                    >
                      <div className="flex items-center gap-4 mb-8">
                        <div className={`p-4 rounded-2xl bg-gradient-to-br ${selectedArchPart.color} text-black shadow-xl`}>
                          {selectedArchPart.icon}
                        </div>
                        <div>
                          <h3 className="text-2xl font-black tracking-tight">{selectedArchPart.name}</h3>
                          <p className="text-sm text-white/40 uppercase tracking-widest font-mono">Internal Component</p>
                        </div>
                      </div>
                      
                      <p className="text-white/70 leading-relaxed mb-8">
                        {selectedArchPart.description}
                      </p>

                      <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-2 text-white/30 mb-2">
                          <ShieldCheck className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Deep Technical Insights</span>
                        </div>
                        {selectedArchPart.insights.map((insight, i) => (
                          <motion.div 
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="flex gap-3 items-start p-4 rounded-xl bg-white/5 border border-white/5 group hover:bg-white/10 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4 mt-0.5 text-white/20 group-hover:text-white transition-colors" />
                            <p className="text-sm text-white/60">{insight}</p>
                          </motion.div>
                        ))}
                      </div>

                      <button 
                        onClick={() => setSelectedArchPart(null)}
                        className="mt-8 w-full py-4 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
                      >
                        Close Details
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center text-center p-12"
                    >
                      <div className="p-6 rounded-full bg-white/5 mb-6">
                        <Info className="w-12 h-12 text-white/20" />
                      </div>
                      <h3 className="text-xl font-bold mb-2 text-white/60">Interactive Explorer</h3>
                      <p className="text-sm text-white/30 max-w-xs">
                        Click on any component in the architecture diagram to reveal senior-level technical details and internal mechanics.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Proceed Button */}
          <div className="mt-8 md:mt-12 flex justify-center">
            <motion.button
              whileHover={{ scale: 1.05, gap: '1.5rem' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollToSection('event-loop')}
              className="group flex items-center gap-3 md:gap-4 px-6 md:px-8 py-3 md:py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              <span className="text-[10px] md:text-xs font-black tracking-[0.2em] md:tracking-[0.3em] uppercase text-white/60 group-hover:text-white">Proceed to Event Loop</span>
              <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-purple-500 group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </section>

        <section id="event-loop">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 md:mb-12 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-green-500 rounded-full" />
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">The Event Loop</h2>
            </div>
            <div className="hidden md:flex items-center gap-2 text-white/30 text-[10px] font-bold uppercase tracking-widest">
              <Info className="w-4 h-4" />
              Click any phase to explore
            </div>
          </div>

          <div className="flex flex-col md:grid md:grid-cols-12 gap-6 md:gap-12">
            {/* Phase List - Horizontal on Mobile, Vertical on Desktop */}
            <div className="md:col-span-3 md:sticky md:top-16 self-start z-40">
              <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-4 md:pb-0 scrollbar-hide">
                {EVENT_LOOP_PHASES.map((phase, i) => (
                  <div key={phase.id} className="shrink-0 md:shrink w-40 md:w-full">
                    <EventLoopPhase 
                      phase={phase} 
                      isActive={activePhase.id === phase.id}
                      onClick={() => {
                        setLoopIndex(i);
                        setIsAutoLooping(false);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Visualizer & Code */}
            <div className="md:col-span-9 space-y-6 md:space-y-8">
              <div className="bg-white/5 rounded-[2rem] md:rounded-[2.5rem] border border-white/10 p-6 md:p-12 flex flex-col relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                
                <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
                  {/* ── 3D Event Loop Torus ───────────────────────────────── */}
                  <div className="relative w-full rounded-2xl overflow-hidden" style={{ height: '420px' }}>
                    <EventLoop3D
                      activeIndex={loopIndex}
                      onPhaseClick={(i) => {
                        setLoopIndex(i);
                        setIsAutoLooping(false);
                      }}
                    />
                    {/* Active phase name overlay at bottom of canvas */}
                    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-4 pointer-events-none z-10">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={activePhase.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.3 }}
                          className="text-center"
                        >
                          <h3 className={`text-2xl md:text-3xl font-black tracking-tighter ${activePhase.color}`}>
                            {activePhase.name}
                          </h3>
                          <p className="text-white/35 text-[10px] font-mono mt-0.5 tracking-wider uppercase">
                            click a node · auto-advancing
                          </p>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    {/* Subtle vignette edges */}
                    <div className="absolute inset-0 pointer-events-none rounded-2xl shadow-[inset_0_0_60px_rgba(0,0,0,0.7)]" />
                  </div>

                  {/* Code & Insights */}
                  <div className="space-y-6 md:space-y-8">
                    <div className="bg-black/60 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-white/40" />
                          <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Code Context</span>
                        </div>
                        <button 
                          onClick={runSimulation}
                          disabled={isExecuting}
                          className="flex items-center gap-1 text-[10px] font-bold text-green-500 hover:text-green-400 transition-colors disabled:opacity-50"
                        >
                          <Play className="w-3 h-3 fill-current" /> RUN
                        </button>
                      </div>
                      <div className="p-4 md:p-6 font-mono text-xs md:text-sm leading-relaxed overflow-x-auto scrollbar-hide">
                        <pre className="leading-relaxed whitespace-pre-wrap">
                          {highlightJS(activePhase.code)}
                        </pre>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-white/40">
                        <Activity className="w-4 h-4 text-purple-400" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Phase Breakdown</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {activePhase.details.map((detail, i) => (
                          <motion.div 
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center gap-3"
                          >
                            <div className={`w-1.5 h-1.5 rounded-full bg-current shrink-0 ${activePhase.color}`} />
                            <p className="text-xs md:text-sm text-white/70 leading-relaxed">{detail}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-white/40">
                        <ShieldCheck className="w-4 h-4 text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Senior Insights</span>
                      </div>
                      <div className="space-y-2 md:space-y-3">
                        {activePhase.seniorInsights.map((insight, i) => (
                          <motion.div 
                            key={i}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="flex gap-3 items-start p-3 md:p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 group hover:bg-blue-500/10 transition-colors"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0 group-hover:scale-150 transition-transform" />
                            <p className="text-xs md:text-sm text-blue-200/70 leading-relaxed">{insight}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Simulation Terminal */}
              <div className="bg-black rounded-2xl md:rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="flex items-center gap-2 px-6 py-4 bg-white/5 border-b border-white/10">
                  <Activity className="w-4 h-4 text-green-500" />
                  <span className="text-xs font-bold uppercase tracking-widest text-white/60">Execution Logs</span>
                </div>
                <div className="h-40 md:h-48 overflow-y-auto p-4 md:p-6 font-mono text-[10px] md:text-xs space-y-2 scrollbar-hide">
                  {logs.length === 0 && <div className="text-white/20 italic">Click "RUN" to simulate execution...</div>}
                  {logs.map((log, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex gap-3 ${
                        log.type === 'system' ? 'text-white/40' :
                        log.type === 'phase' ? 'text-purple-400 font-bold' :
                        log.type === 'code' ? 'text-blue-400' :
                        log.type === 'output' ? 'text-green-400 pl-4 border-l border-green-500/30' :
                        log.type === 'success' ? 'text-green-500/60' : 'text-white/60'
                      }`}
                    >
                      <span className="opacity-30">[{new Date().toLocaleTimeString()}]</span>
                      <span>{log.msg}</span>
                    </motion.div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </div>

          {/* Proceed Button */}
          <div className="mt-8 md:mt-12 flex justify-center">
            <motion.button
              whileHover={{ scale: 1.05, gap: '1.5rem' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollToSection('microtasks')}
              className="group flex items-center gap-3 md:gap-4 px-6 md:px-8 py-3 md:py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              <span className="text-[10px] md:text-xs font-black tracking-[0.2em] md:tracking-[0.3em] uppercase text-white/60 group-hover:text-white">Next: Microtasks</span>
              <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-green-500 group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </section>

        {/* Section 3: Microtasks & Starvation */}
        <section id="microtasks" className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent rounded-[2rem] md:rounded-[3rem] -z-10" />
          <div className="grid lg:grid-cols-2 gap-8 md:gap-16 items-center p-6 md:p-12">
            <div>
              <div className="flex items-center gap-3 mb-6 md:mb-8">
                <Zap className="w-6 h-6 md:w-8 md:h-8 text-yellow-400" />
                <h2 className="text-2xl md:text-4xl font-black tracking-tight">The Microtask Nuance</h2>
              </div>
              <p className="text-base md:text-lg text-white/50 mb-6 md:mb-8 leading-relaxed">
                <code className="text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">process.nextTick()</code> and{' '}
                <code className="text-blue-400 bg-blue-400/10 px-2 py-1 rounded">Promise</code> callbacks are{' '}
                <span className="text-white/70 font-medium">not part of the event loop</span> — they are microtask hooks that drain between{' '}
                <span className="text-white/70 italic">every single phase</span>, including after each individual callback since Node.js 11.
              </p>

              <div className="space-y-4 md:space-y-6">
                <div className="p-4 md:p-6 rounded-2xl bg-green-500/5 border border-green-500/20 hover:border-green-400/40 transition-colors">
                  <h4 className="font-bold text-green-400 mb-2 md:mb-3 flex items-center gap-2 text-sm md:text-base">
                    <RefreshCw className="w-4 h-4 md:w-5 md:h-5" /> Runs Between Every Phase
                  </h4>
                  <p className="text-xs md:text-sm text-white/60 leading-relaxed mb-3">
                    The correct mental model for a single loop iteration:
                  </p>
                  <div className="font-mono text-[10px] md:text-xs space-y-1 text-white/50">
                    {[
                      ['Phase executes one callback', 'text-white/70'],
                      ['→ drain nextTick queue', 'text-yellow-400/80'],
                      ['→ drain Promise microtask queue', 'text-blue-400/80'],
                      ['Next callback or next phase', 'text-white/70'],
                      ['→ drain nextTick queue', 'text-yellow-400/80'],
                      ['→ drain Promise microtask queue', 'text-blue-400/80'],
                      ['…repeat until phase is empty', 'text-white/30'],
                    ].map(([line, cls], i) => (
                      <div key={i} className={`${cls} pl-${line.startsWith('→') ? '4' : '0'}`}>{line}</div>
                    ))}
                  </div>
                </div>
                <div className="p-4 md:p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-yellow-400/30 transition-colors">
                  <h4 className="font-bold text-yellow-400 mb-2 md:mb-3 flex items-center gap-2 text-sm md:text-base">
                    <AlertCircle className="w-4 h-4 md:w-5 md:h-5" /> Event Loop Starvation
                  </h4>
                  <p className="text-xs md:text-sm text-white/60 leading-relaxed">
                    Because nextTick drains between <em>every callback</em>, recursively calling{' '}
                    <code className="text-yellow-400">nextTick</code> prevents the loop from ever advancing to the next phase — regardless of which phase it's currently in.
                  </p>
                </div>
                <div className="p-4 md:p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-400/30 transition-colors">
                  <h4 className="font-bold text-blue-400 mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
                    <Info className="w-4 h-4 md:w-5 md:h-5" /> Microtask Queue Priority
                  </h4>
                  <MicrotaskQueues />
                </div>
              </div>
            </div>
            
            <div className="space-y-6 md:space-y-8">
              <div className="bg-black/40 rounded-2xl md:rounded-3xl border border-white/10 p-6 md:p-8 font-mono text-xs md:text-sm relative group overflow-x-auto scrollbar-hide">
                <div className="absolute top-2 right-2 md:-top-4 md:-right-4 bg-yellow-400 text-black px-2 py-0.5 md:px-3 md:py-1 rounded-lg text-[8px] md:text-[10px] font-black tracking-widest shadow-xl">DANGER ZONE</div>
                <pre className="leading-relaxed whitespace-pre-wrap">
                  {highlightJS(`function starve() {\n  // This will block the loop FOREVER\n  process.nextTick(starve);\n}\n\n// Event loop will never reach here\nsetTimeout(() => {\n  console.log('This will never run');\n}, 100);\n\nstarve();`)}
                </pre>
                <div className="mt-4 md:mt-6 p-3 md:p-4 rounded-xl bg-yellow-400/10 border border-yellow-400/20 text-xs md:text-sm text-yellow-200/60 italic">
                  "A lead engineer uses setImmediate() for recursive async tasks to allow the loop to breathe."
                </div>
              </div>
              <ExecutionOrderCard />
            </div>
          </div>

          {/* Final Button */}
          <div className="mt-8 md:mt-12 flex justify-center">
            <motion.button
              whileHover={{ scale: 1.05, gap: '1.5rem' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollToSection('top')}
              className="group flex items-center gap-3 md:gap-4 px-6 md:px-8 py-3 md:py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              <span className="text-[10px] md:text-xs font-black tracking-[0.2em] md:tracking-[0.3em] uppercase text-white/60 group-hover:text-white">Back to Top</span>
              <RefreshCw className="w-4 h-4 md:w-5 md:h-5 text-yellow-500 group-hover:rotate-180 transition-transform duration-500" />
            </motion.button>
          </div>
        </section>

        {/* Footer Info */}
        <footer className="pt-20 border-t border-white/10 text-center space-y-4">
          <div className="flex justify-center gap-6 text-white/20">
            <Cpu className="w-5 h-5" />
            <RefreshCw className="w-5 h-5" />
            <Database className="w-5 h-5" />
          </div>
          <p className="text-white/30 text-xs font-mono uppercase tracking-[0.4em]">
            Node.js Internals Explorer • v2.0.0 • Senior Edition
          </p>
        </footer>
      </main>

      {/* Custom Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
