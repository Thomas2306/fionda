// Le icone di Fionda per l'app (stesso disegno del PC: ui/icone.ts). Niente emoji.
import { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { GLIFI, SCINTILLA, simbolo, type NomeGlifo } from './icone';

export function Glifo({ nome, dim = 24, colore = '#fff', tratto = 1.8 }: { nome: NomeGlifo; dim?: number; colore?: string; tratto?: number }) {
  return (
    <Svg width={dim} height={dim} viewBox="0 0 24 24" fill="none">
      <Path d={GLIFI[nome]} stroke={colore} strokeWidth={tratto} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Glifo con il tratto a gradiente lavanda → ciano. */
export function GlifoLuce({ nome, dim = 24, tratto = 1.8 }: { nome: NomeGlifo; dim?: number; tratto?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg width={dim} height={dim} viewBox="0 0 24 24" fill="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#BBA8FF" />
          <Stop offset="1" stopColor="#5CE1FF" />
        </LinearGradient>
      </Defs>
      <Path d={GLIFI[nome]} stroke={`url(#${id})`} strokeWidth={tratto} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Uno dei 32 simboli del collegamento (forma piena a gradiente). */
export function Simbolo({ n, dim = 34 }: { n: number; dim?: number }) {
  const id = useId().replace(/:/g, '');
  const { forma, colore } = simbolo(n);
  return (
    <Svg width={dim} height={dim} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colore.da} />
          <Stop offset="1" stopColor={colore.a} />
        </LinearGradient>
      </Defs>
      <Path d={forma.d} fill={`url(#${id})`} fillRule={forma.pari ? 'evenodd' : 'nonzero'} />
    </Svg>
  );
}

export function Scintilla({ dim = 12, colore = '#fff' }: { dim?: number; colore?: string }) {
  return (
    <Svg width={dim} height={dim} viewBox="0 0 24 24">
      <Path d={SCINTILLA} fill={colore} />
    </Svg>
  );
}
