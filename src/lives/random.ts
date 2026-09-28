export class RNG {
  constructor(private state: number) { this.state = state >>> 0; }
  next() { let t = this.state = (this.state + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  shuffle<T>(a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i+1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  pick(weights: number[]) { const sum = weights.reduce((s,n)=>s+n,0); let n=this.next()*sum; for(let i=0;i<weights.length;i++){ n-=weights[i]; if(n<0)return i; } return weights.length-1; }
}
