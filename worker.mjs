import {loadPyodide} from './runtime/pyodide.mjs';
const runtime = (async () => {
  const py = await loadPyodide({indexURL:new URL('./runtime/',self.location.href).href});
  await py.loadPackage('pyyaml');
  const response = await fetch(new URL('./engine.zip'+self.location.search,self.location.href));
  if (!response.ok) throw Error('Engine download failed');
  py.unpackArchive(await response.arrayBuffer(),'zip');
  py.runPython('import json; from engine import generate');
  return py;
})();
self.onmessage = async ({data}) => {
  try {
    const py = await runtime;
    py.globals.set('request_json',JSON.stringify(data));
    const result=py.runPython('json.dumps(generate(json.loads(request_json)))');
    self.postMessage({result:JSON.parse(result)});
  } catch(error) {self.postMessage({error:String(error)});}
};
