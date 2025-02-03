// creiamo una struct
struct VertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance : u32
}
struct VertexOutput {
    @builtin(position)pos: vec4f,
    @location(0) cell : vec2f
}
//definiamo un binding group
@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage> cellState: array<u32>;

// deve ritornare almeno l'ultima posizione del vertice processato
// definiamo questo valore con @builtin e il suo tipo, quindi vec4f
// passiamo come argomento @location(0) che si riferisce all'attributo
// che abbiamo definito in attributes in vertexBufferInput
@vertex fn vertexMain(input : VertexInput) -> VertexOutput 
{
    // Converto l'indice dell'istanza in un float per poterlo usare con f32 e floor
    let i = f32(input.instance);
    let state = f32(cellState[input.instance]);
    let cell = vec2f(i % grid.x, floor(i / grid.x));
    let cellOffset = cell / grid*2 ; // Compute the offset to cell
    let gridPos = (input.pos * state + 1) / grid - 1+ cellOffset ; // Add it here!
    var output: VertexOutput;
    output.pos = vec4f(gridPos, 0, 1);
    output.cell = cell;

    return output;
}

struct FragInput {
   @location(0) cell: vec2f, 
}
// qua invece @location(0) si riferisce al colorAttachment
// che abbiamo definito nel render pass, serve per capire su quale
// color attachment viene fatto colorare il pixel
@fragment fn fragmentMain(input : FragInput) -> @location(0) vec4f {
    var cell = input.cell;
    var c = cell/grid;

    return vec4f( 2-c.y,c.x, 1-c.y, 1); // (Red, Green, Blue, Alpha)
}
