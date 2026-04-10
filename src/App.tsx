/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
    description: 'The high-performance JavaScript engine developed by Google. It compiles JS directly to native machine code.',
    insights: [
      'Ignition & TurboFan: The two-stage pipeline for interpreting and optimizing code.',
      'Hidden Classes: How V8 optimizes property access in dynamic objects.',
      'Memory Heap: Divided into New Space (Young Gen) and Old Space (Old Gen).',
      'Write Barriers: Essential for the incremental marking phase of GC.'
    ],
    color: 'from-yellow-400 to-orange-500',
    icon: <Cpu className="w-6 h-6" />
  },
  {
    id: 'bindings',
    name: 'Node Bindings',
    description: 'The C++ layer that bridges the gap between JavaScript and the underlying OS-level libraries.',
    insights: [
      'libnode: The core C++ library that wraps V8 and Libuv.',
      'Internal Bindings: Native modules like "tcp_wrap" and "fs_event_wrap".',
      'Buffer Management: Zero-copy data sharing between JS and C++.',
      'Addon API: Using node-addon-api for high-performance native extensions.'
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
      'Tick: A single iteration through all phases of the loop.'
    ],
    color: 'from-blue-400 to-indigo-600',
    icon: <RefreshCw className="w-6 h-6" />
  },
  {
    id: 'thread-pool',
    name: 'Thread Pool',
    description: 'A pool of worker threads managed by Libuv to handle operations that would otherwise block the main loop.',
    insights: [
      'Worker Threads: Offloading CPU-intensive or blocking synchronous I/O.',
      'Task Queue: Tasks are queued and picked up by the next available worker.',
      'UV_THREADPOOL_SIZE: Tuning this is critical for high-concurrency I/O apps.',
      'Signal Handling: How workers notify the main loop of task completion.'
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
    description: 'Executes I/O callbacks deferred from the previous loop iteration.',
    details: [
      'Handles system-level errors (like TCP errors).',
      'Callbacks that were not executed in the previous Poll phase.'
    ],
    seniorInsights: [
      'This phase handles callbacks for some system operations such as types of TCP errors.',
      'If a TCP socket receives ECONNREFUSED when attempting to connect, some *nix systems want to wait to report the error.',
      'It is rarely relevant for typical app logic but critical for system stability.'
    ],
    color: 'text-purple-400',
    icon: <Activity className="w-5 h-5" />,
    code: `// Internal system callbacks\n// e.g., TCP connection errors`
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
      'setImmediate() is technically a "check" phase timer.',
      'If called from within an I/O cycle, setImmediate() will always run before any setTimeout().',
      'It is often preferred over setTimeout(fn, 0) because it avoids the timer heap overhead.'
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
  const [radius, setRadius] = useState(140);

  // Update radius based on window size
  useEffect(() => {
    const updateRadius = () => {
      setRadius(window.innerWidth < 640 ? 100 : 140);
    };
    updateRadius();
    window.addEventListener('resize', updateRadius);
    return () => window.removeEventListener('resize', updateRadius);
  }, []);
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
      addLog('🔍 Checking timer heap...', 'info', 2000);
      addLog('✅ Found expired timer: 100ms', 'success', 2500);
      addLog('📝 Executing: console.log("Timer expired!")', 'code', 3000);
      addLog('> Timer expired!', 'output', 3200);
    } else if (activePhase.id === 'poll') {
      addLog('📡 Polling for I/O events...', 'info', 2000);
      addLog('📥 Received event: fs.readFile complete', 'success', 2500);
      addLog('📝 Executing callback...', 'code', 3000);
      addLog('> File read complete!', 'output', 3200);
    } else if (activePhase.id === 'check') {
      addLog('🔍 Checking immediate queue...', 'info', 2000);
      addLog('✅ Found setImmediate callback', 'success', 2500);
      addLog('📝 Executing: console.log("Immediate execution!")', 'code', 3000);
      addLog('> Immediate execution!', 'output', 3200);
    } else {
      addLog('ℹ️ Processing internal callbacks...', 'info', 2000);
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
      {/* Header */}
      <header id="top" className="border-b border-white/10 py-8 md:py-12 px-4 md:px-12 bg-gradient-to-b from-white/5 to-transparent relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-green-500/5 to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mb-4 md:mb-6"
          >
            <div className="p-2 md:p-3 rounded-xl bg-green-500/20 text-green-500 border border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
              <RefreshCw className="w-6 h-6 md:w-8 md:h-8 animate-spin-slow" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-green-500/60 block mb-1">Senior Engineering Guide</span>
              <h2 className="text-[10px] md:text-sm font-bold text-white/40">NODE_ENV=production</h2>
            </div>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl xs:text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-black tracking-tighter mb-4 md:mb-6 leading-[0.9] break-words"
          >
            THE <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">EVENT LOOP</span> <br />
            <span className="text-white/20">UNMASKED</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-base md:text-xl text-white/50 max-w-3xl leading-relaxed font-light"
          >
            A deep dive into the asynchronous heart of Node.js. Beyond the basics: understanding Libuv, 
            thread pools, and the precise mechanics of phase transitions.
          </motion.p>
        </div>
      </header>

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
            <div className="md:col-span-3 md:sticky md:top-12 self-start z-40">
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
                  {/* Circular Visualization */}
                  <div className="relative aspect-square flex items-center justify-center scale-[0.65] xs:scale-75 sm:scale-90 md:scale-100">
                    {/* Rotating Background Rings */}
                    <div className="absolute w-full h-full border border-dashed border-white/5 rounded-full animate-spin-slow" />
                    <div className="absolute w-3/4 h-3/4 border border-white/5 rounded-full" />
                    
                    {/* Active Phase Pointer/Scanner */}
                    <motion.div 
                      className="absolute inset-0 z-10 pointer-events-none"
                      animate={{ rotate: (loopIndex / EVENT_LOOP_PHASES.length) * 360 }}
                      transition={{ type: 'spring', stiffness: 50, damping: 15 }}
                    >
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1/2 bg-gradient-to-b from-green-500/50 to-transparent blur-sm" />
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 bg-green-500/20 rounded-full blur-xl" />
                    </motion.div>

                    {EVENT_LOOP_PHASES.map((phase, i) => {
                      const angle = (i / EVENT_LOOP_PHASES.length) * Math.PI * 2 - Math.PI / 2;
                      const x = Math.cos(angle) * radius;
                      const y = Math.sin(angle) * radius;
                      
                      return (
                        <motion.button
                          key={phase.id}
                          className="absolute z-30"
                          onClick={() => {
                            setLoopIndex(i);
                            setIsAutoLooping(false);
                          }}
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                          animate={{
                            x: x,
                            y: y,
                            scale: activePhase.id === phase.id ? 1.3 : 1,
                            opacity: activePhase.id === phase.id ? 1 : 0.4
                          }}
                        >
                          <div className={`p-2.5 sm:p-3 md:p-4 rounded-xl md:rounded-2xl bg-black border-2 shadow-2xl transition-colors ${activePhase.id === phase.id ? 'border-white' : 'border-white/10 hover:border-white/30'} ${phase.color}`}>
                            {React.cloneElement(phase.icon as React.ReactElement, { className: 'w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6' })}
                          </div>
                          {activePhase.id === phase.id && (
                            <motion.div 
                              layoutId="phase-glow"
                              className="absolute inset-0 rounded-xl md:rounded-2xl bg-current opacity-20 blur-xl"
                            />
                          )}
                        </motion.button>
                      );
                    })}

                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activePhase.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.2 }}
                        className="z-20 text-center px-2 sm:px-4"
                      >
                        <h3 className={`text-lg sm:text-2xl md:text-4xl font-black mb-1 sm:mb-2 tracking-tighter leading-tight ${activePhase.color}`}>{activePhase.name}</h3>
                        <div className="h-0.5 sm:h-1 w-6 sm:w-12 bg-white/20 mx-auto rounded-full" />
                      </motion.div>
                    </AnimatePresence>
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
                        <pre className="text-white/80">
                          {activePhase.code}
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
                Senior developers know that <code className="text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">process.nextTick()</code> is 
                NOT part of the event loop. It's a post-operation hook that executes immediately after the current operation.
              </p>
              
              <div className="space-y-4 md:space-y-6">
                <div className="p-4 md:p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-yellow-400/30 transition-colors">
                  <h4 className="font-bold text-yellow-400 mb-2 md:mb-3 flex items-center gap-2 text-sm md:text-base">
                    <AlertCircle className="w-4 h-4 md:w-5 md:h-5" /> Event Loop Starvation
                  </h4>
                  <p className="text-xs md:text-sm text-white/60 leading-relaxed">
                    If you recursively call <code className="text-yellow-400">nextTick</code>, Node.js will keep processing that queue 
                    and never reach the next phase of the event loop.
                  </p>
                </div>
                <div className="p-4 md:p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-400/30 transition-colors">
                  <h4 className="font-bold text-blue-400 mb-2 md:mb-3 flex items-center gap-2 text-sm md:text-base">
                    <Info className="w-4 h-4 md:w-5 md:h-5" /> Microtask Queue Priority
                  </h4>
                  <ol className="text-[10px] md:text-sm text-white/60 space-y-1 md:space-y-2 list-decimal list-inside">
                    <li><span className="text-yellow-400">nextTick Queue</span> (Highest)</li>
                    <li><span className="text-blue-400">Promise Queue</span> (then/catch/finally)</li>
                    <li>Event Loop Phases (Macrotasks)</li>
                  </ol>
                </div>
              </div>
            </div>
            
            <div className="bg-black/40 rounded-2xl md:rounded-3xl border border-white/10 p-6 md:p-8 font-mono text-xs md:text-sm relative group overflow-x-auto scrollbar-hide">
              <div className="absolute top-2 right-2 md:-top-4 md:-right-4 bg-yellow-400 text-black px-2 py-0.5 md:px-3 md:py-1 rounded-lg text-[8px] md:text-[10px] font-black tracking-widest shadow-xl">DANGER ZONE</div>
              <pre className="text-white/80 leading-relaxed">
{`function starve() {
  // This will block the loop FOREVER
  process.nextTick(starve);
}

// Event loop will never reach here
setTimeout(() => {
  console.log('This will never run');
}, 100);

starve();`}
              </pre>
              <div className="mt-4 md:mt-6 p-3 md:p-4 rounded-xl bg-yellow-400/10 border border-yellow-400/20 text-xs md:text-sm text-yellow-200/60 italic">
                "A lead engineer uses setImmediate() for recursive async tasks to allow the loop to breathe."
              </div>
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
