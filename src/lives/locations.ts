import geometry from '../data/rotterdamBuurten.json';
import { RNG } from './random';
import type { Person } from './types';
type Point = [number,number];
type Polygon = Point[][];
const shapes=new Map(geometry.features.map(f=>[f.properties.code, (f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates) as Polygon[]]));
function inRing(p:Point,ring:Point[]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function insideArea(point:Point,area:string){return shapes.get(area)?.some(poly=>inRing(point,poly[0])&&!poly.slice(1).some(r=>inRing(point,r)))??false;}
export function householdPoint(person:Person,seed:number):Point|null{
  const shape=shapes.get(person.area);if(!shape)return null;
  const points=shape.flatMap(p=>p[0]),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const rng=new RNG(seed ^ Math.imul((person.household>=0?person.household:person.id)+1,2654435761));
  for(let k=0;k<3000;k++){const p:Point=[minX+rng.next()*(maxX-minX),minY+rng.next()*(maxY-minY)];if(insideArea(p,person.area))return p;}
  return null;
}
