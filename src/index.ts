// Entrance module
import Main from './main'

// Global initialization
globalThis.onload = () => {
  const main = new Main();
  // Initiate runtime loop
  main.update();
}
  
  
  
  