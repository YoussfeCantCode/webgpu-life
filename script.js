const response = await fetch("./shader.wgsl");
const shader = await response.text();
const GRID_SIZE = 256;
const canvas = document.querySelector("canvas");
// NOTE: controllare se il browser supporta webGPU
if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
}

/* for (let i = 0; i <= GRID_SIZE * GRID_SIZE; i++) {
  console.log("x:", i % GRID_SIZE, "y:", Math.floor(i / GRID_SIZE))
} */


/**
 * NOTE: Un adattatore è una rappresentazione WebGPU
 *  di un componente specifico dell'hardware GPU
 *  del tuo dispositivo.
 */
const adapter = await navigator.gpu.requestAdapter();

// NOTE: se non viene rilevata la GPU o se è obsoleta crea un errore
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}

/**
 * NOTE: Con l'adapter possiamo richiedere il device che
 * è l'interfaccia principale con la quale lavoreremo
 * e alla quale potremo dare comandi alla GPU
 */
const device = await adapter.requestDevice();

/**
 * NOTE: per usare il device che abbiamo appena creato
 * per mostrare effettivamente qualcosa nella pagina
 * dobbiamo prima assegnarlo a un contesto
 * quindi richiediamo il contesto e lo assegnamo
 * a una variabile
 * (come faremmo anche con WebGL e Canvas 2D)
 */
const context = canvas.getContext("webgpu");

/**
 *  NOTE:  riceviamo il pixel format preferito del dispositivo sul canvas
 *
 * (
 * nel mio caso è bgra8unorm che sta per:
 * bgra: blue,green,red,alpha
 * 8: ogni valore occupa 8 bit (1 byte) e questo vuol dire che ogni pixel occuperà 32 bits (4 byte)
 * unorm: unsigned normalized (ogni valore è un integer 8 bit (0-255) ma
 *  quando viene normalizzato nel linguaggio shader il range diventa 0-1
 *  ESEMPIO: 0 diventa 0, 255 diventa 1 e 51 diventa 0.2 )
 * )
 *
 */
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

// al contesto richiesto in precedenza
context.configure({
  device: device, // impostiamo il device che verrà usato per disegnare
  format: canvasFormat, // e il pixel format del canvas
});

/**
 * NOTE: definisco i vertici di un quadrato ricordandomi
 * che sono coppie di 2 coordinate(x,y),
 * inoltre bisogna ricordarsi che la computer
 * grafica si riduce sempre a una serie di triangoli
 * messi insieme, ecco perchè qua sono definiti
 * i vertici di 2 triangoli che messi insieme formeranno un quadrato
 * N.B
 * quando definiamo i vertici possiamo
 * considerare il canvas come un piano cartesiano
 * dove il centro viene rappresentato con 0.0, 0.0
 * il centro destra con 0.0, 1.0
 * il centro sinistra con -1.0, 0.0
 * e così via
 */
const vertices = new Float32Array([
  -0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, -0.8, 0.8, 0.8, -0.8, 0.8
])




/**
 * NOTE:i vertici creati in precedenza con un array
 * il cui ogni elemento è un Float che occupa 32 bit (4 bytes)
 * non possono essere letti direttamente dalla GPU per questo andiamo
 * a creare un memory buffer (attualmente vuoto), in cui andiamo a definire:
 */
const vertexBuffer = device.createBuffer({
  // un label che ci torna utile in caso di errori in console
  label: "Cell vertices",

  // la lunghezza dell'array in bytes
  // per assicurarci che crei il buffer delle
  // giuste dimensioni
  size: vertices.byteLength,

  // l'utilizzo di questo buffer:
  // che venga utilizzato per leggere i dati dei vertici
  // copiare i dati al suo interno
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

/**
 * Copiamo i dati dei vertici nel buffer
 * attraverso il device creato prima (riga77), per farlo
 * aggiungiamo alla queue del device la scrittura del buffer
 * attraverso la funzione .queue.writeBuffer(buffer-creato-prima, offset, array-di-vertici)
 */
device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

/**
 * abbiamo inserito i dati nel buffer,
 * MA per ora è solo un insieme di bytes senza senso
 * e la GPU non riuscirebbe a capirli.
 * Andiamo a definire una struttura.
 */
const vertexBufferLayout = {
  // di quanti byte deve saltare la GPU nel
  // buffer per trovare il prossimo vertice
  // (ogni elemento nell'array è di 4 byte e una
  // coordinata richiede 2 elementi quindi 8 byte)
  arrayStride: 8,
  attributes: [
    // attributi, possono essercene tanti ma ne usiamo solo uno
    {
      format: "float32x2",
      offset: 0,
      shaderLocation: 0, // Position, see vertex shader
    },
  ],
};

/**
 * facciamo la stessa cosa ma creando un 
 * uniform bufferArray per passare ad ogni
 * invocazione dello shader il grid size in
 * GRID_SIZE X GRID_SIZE
 
//  */
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  // usiamo uniform al posto di buffer
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

/*  
 * andiamo a creare un Uint32Array per poter conservare
 * i dati relativi allo stato della cella, quindi se la 
 * cella è accesa o spenta
*/
const storageArray = new Uint32Array(GRID_SIZE * GRID_SIZE)

/*
 * creiamo un array di buffer che usano
 * lo stesso array di dati per poter utilizzare
 * il ping-pong pattern
 */

const cellStateArray = [
  device.createBuffer({
    label: "storage state A",
    size: storageArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
  device.createBuffer({
    label: "storage state B",
    size: storageArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  })
]

for (let i = 0; i <= storageArray.length; i++) {
  storageArray[i] = Math.random() > 0.6 ? 1 : 0;
}



device.queue.writeBuffer(cellStateArray[0], 0, storageArray)

// possiamo riscrivere i dati nell'array dopo che è stato
// assegnato al buffer e riassegnarlo di nuovo ad un nuovo
// buffer

device.queue.writeBuffer(cellStateArray[1], 0, storageArray)

/**
 * Ora hai i dati che vuoi visualizzare, ma devi comunque
 * dire alla GPU esattamente come elaborarli.
 * Gran parte di questo avviene con gli shader.
 *
 * Gli shader sono piccoli programmi che scrivi ed esegui sulla GPU in parallelo.
 *
 * Per creare degli shader chiami device.createShaderModule(),
 * al quale puoi passare un label e il codice WGSL, la funzione
 * ritorna un oggetto con lo shader compilato
 */
const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: shader,
});

// creiamo un binding group layout
// che rappresenterà i dati che andremo ad
// inserire nei vari binding group
const bindGroupLayout = device.createBindGroupLayout({

  label: "cell bind group layout",
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      buffer: {} //uniform di default, lo usiamo per il grid
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
      buffer: { type: 'read-only-storage' } // stato cella input
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" } //stato cella output
    }
  ]
})



// un workgroup è un vettore
// tridimensionale di coordinate che viene
// utilizzato per ottimizzare le performance.
// Esiste un workgroup ideale per ogni lavoro su
// ogni GPU ma con webGPU non abbiamo sempre accesso
// a quelle informazioni, dunque scegliamo
// un valore arbitrario di 8 (8x8x1)
const WORKGROUP_SIZE = 8;

// creiamo un compute shader sul quale andremo a eseguire
// la simulazione 
const simulationShaderModule = device.createShaderModule({
  label: "Game of Life simulation shader",
  code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;
  
    @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
    @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

    //funzione per mappare il nostro indice tridimensionale
    // in un u32 integer
    fn cellIndex(cell: vec2u) -> u32 {
      return cell.y * u32(grid.x) + cell.x;
    }

    fn cellActive(x: u32, y: u32) -> u32 {
      return cellStateIn[cellIndex(vec2(x, y))];
    }

    @compute @workgroup_size(${WORKGROUP_SIZE},${WORKGROUP_SIZE}) //definiamo il workgroup
     fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
     // Determine how many active neighbors this cell has.
      let activeNeighbors = cellActive(cell.x+1, cell.y+1) +
                            cellActive(cell.x+1, cell.y) +
                            cellActive(cell.x+1, cell.y-1) +
                            cellActive(cell.x, cell.y-1) +
                            cellActive(cell.x-1, cell.y-1) +
                            cellActive(cell.x-1, cell.y) +
                            cellActive(cell.x-1, cell.y+1) +
                            cellActive(cell.x, cell.y+1);

      let i = cellIndex(cell.xy);

      // Conway's game of life rules:
      switch activeNeighbors {
        case 2: {
          cellStateOut[i] = cellStateIn[i];
        }
        case 3: {
          cellStateOut[i] = 1;
        }
        default: {
          cellStateOut[i] = 0;
        }
      }
    }`
});
// creiamo un pipeline layout che assegneremo
// alla nostra pipeline
const pipelineLayout = device.createPipelineLayout({
  label: "Cell Pipeline Layout",
  bindGroupLayouts: [bindGroupLayout],
});

/**
 * definiamo la pipeline di rendering che
 *  verrà inizializzata nel render pas
 * e andiamo a definire alcune proprietà
 */
const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline", //label opzionale
  layout: pipelineLayout, // aggiungiamo il layout definito prima
  vertex: {
    module: cellShaderModule, //definiamo il modulo da dove prende il codice wgsl
    entryPoint: "vertexMain", // funzione della fase vertex
    buffers: [vertexBufferLayout],
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain", // funzione fase fragments
    targets: [
      {
        format: canvasFormat, // definiamo un target con il pixel format predefinito del canvas
      },
    ],
  },
});

// creiamo la COMPUTE pipeline che verrà
// inizializzata nel compute pas
const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
  }
});

// creiamo un array di binding groups per
// poter conservare i dati di tutte e 2 le
// varianti dello storageBuffer
const bindGroups = [

  device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    },
    {
      binding: 1,
      resource: { buffer: cellStateArray[0] }
    },
    {
      binding: 2,
      resource: { buffer: cellStateArray[1] }
    }
    ],
  }),

  device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    },
    {
      binding: 1,
      resource: { buffer: cellStateArray[1] }
    },
    {
      binding: 2,
      resource: { buffer: cellStateArray[0] }
    }
    ],
  })

]


/*
 * mettiamo tutto il codice relativo al rendering(codice sotto) dentro
 * una funzione per poterla richiamare ogni quanto vogliamo e così possiamo\
 * iniziare un render loop
 */

// definiamo ogni quanto dobbiamo refreshare il render loop e
// ci servirà tenere traccia di quale iterazione sta avvenendo(step)
const UPDATE_INTERVAL = 100; // Update every 200ms (5 times/sec)
let step = 0; // Track how many simulation steps have been run

function updateGrid() {
  /*
    * come per fare qualsiasi cosa in WebGPU, dobbiamo
    * dire alla GPU attraverso dei comandi cosa fare
    * e per farlo usiamo la funzione dell'oggetto device:
    * createCommandEncoder(), assegnamola alla costante encoder.
    * encoder ci restituisce
    * un'interfaccia per la registrazione dei comandi GPU
    */
  const encoder = device.createCommandEncoder();

  const computePass = encoder.beginComputePass();

  computePass.setPipeline(simulationPipeline);

  computePass.setBindGroup(0, bindGroups[step % 2]);

  const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
  computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

  computePass.end();


  step++


  /**
   * beginRenderPass() è una funzione dell'interfaccia
  * di encoder: GPUCommandEncoder che inizia il
   * render pass.
   * Il render pass è dove succedono tutte
   * le operazioni di disegno in WebGPU viene chiamata
   * solo una volta e può essere usata più volte
   * per definire più render pass.
   *
   * La funzione definisce le texture che
   * ricevono l'output di eventuali comandi di disegno eseguiti
   *
   * Ha diverse proprietà tra le quali:
   */
  const pass = encoder.beginRenderPass({
    // serve per definire i colori e la texture da colorare
    // È un array di oggetti che a loro volta hanno diverse proprietà:
    colorAttachments: [
      {
        // view è la texture sulla quale disegnamo
        view: context.getCurrentTexture().createView(), // non passare argomenti implica che usi tutta la lunghezza del canvas

        clearValue: [0, 0.5, 0.7, 1], // valore con il quale coloriamo la texture (rgba)
        loadOp: "clear", // al caricamento riempiamo la texture col colore scelto
        storeOp: "store", // alla fine storiamo il colore sul canvas
      },
    ],
  });

  // indica quale pipeline usare per disegnare
  // quindi anche gli shader usati,
  // il layout del vertex buffer, e alti dati.
  pass.setPipeline(cellPipeline);

  // settiamo il buffer contente i vertici
  // che abbiamo inserito precedentemente
  // (0 perchè è l'elemento numero 0 nell'array dei buffer definiti nella pipeline)
  pass.setVertexBuffer(0, vertexBuffer);

  // settiamo il binding group
  pass.setBindGroup(0, bindGroups[step % 2]);
  // gli diciamo quanti vertici disegnare
  // per renderelo più facile da cambiare puoi
  // usare la lunghezza dell'array/2
  pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertici

  /**
   * finisci il render pass
   * N.B non abbiamo ancora inviato nessun comando alla GPU
   * da quando è iniziato il render pass
   * abbiamo solo registrato dei comandi da mandare in seguito
   */
  pass.end();

  /**
   * per creare un command buffer da mandare alla GPU
   * dobbiamo chiamare finish() sul nostro encoder
   * e subito dopo possiamo usare .queue.submit() sul nostro device che
   * accetta un array di command buffers e li aggiunge
   * alla coda assicurandosi che vengano eseguiti in modo
   * sincronizzato e ordinato
   */
  device.queue.submit([encoder.finish()]);

}

setInterval(updateGrid, UPDATE_INTERVAL)
