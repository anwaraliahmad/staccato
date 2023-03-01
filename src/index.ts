import Main from './main'

// INITIALIZATION (happens once the globalThis loads) 
globalThis.onload = () => {
  let main = new Main();
  let animate = main.update.bind(main);
  main.update();
}
  
  
  
  