# Staccato

![alt text](http://i.imgur.com/rEB95XA.png)

A WebGL music visualizer demo


## About 

A music visualizer experiment simply powered by shaders–which are programs that tell the GPU how to render the material its applied to–and audio Fourier transform data that can easily be accessed by the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode).

Staccato simply takes data from a playing song, updates `uniforms`–which are variables that are passed into shaders for them to use–and now shapes in the scene using these shaders have tastefully modified vertices/color.

The two most important uniforms currently used include `time` and `frequency`, which is the elapsed time and a 32-bit float array for audio volume data, respectively. These two variables are alone enough to make powerful scenes, the beauty comes from simply how they're used in the shaders.


## Making your own visualizations

`Staccato` exists as an easily modifiable object, which handles setting up the audio stream, loading songs, shaders, and adding shapes to the scene. 

Some attributes/methods to modify:
1. `shaders` : list of shaders that Staccato will load when you call `addShape`, make sure to have elements in `index.html` for your vertex (`[shaderName]-vertex`) and fragment (`[shaderName]-fragment`)shader.
2. `uniforms` : object literal containing all uniform variables that each added shape receives
3. `addShape()` : this is the function which adds a mesh to the scene with a specified `geometry`, `shader`, and vector `position`
4. `update()` : should be called every frame to update uniforms, objects, etc
4. There are several functions for setting up the audio which can be modified and used in plenty of other ways 

