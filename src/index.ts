import './styles.css';
import Main from './main';
import { ModernUI } from './ui/ModernUI';

// Initialize the application
const app = new Main();

// Initialize the modern UI
const ui = new ModernUI(app.getVisualizer());

// Expose for debugging
(window as any).staccato = {
  app,
  ui,
  visualizer: app.getVisualizer()
};

console.log('🎵 Staccato Modern WebGL Music Visualizer loaded successfully!');
console.log('📖 Check the README for usage instructions and features.');
  
  
  
  