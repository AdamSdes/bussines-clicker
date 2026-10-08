import { BUSINESSES } from './engine/config';

export default function App() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gold">Империя с нуля</h1>
      <p className="text-ink-dim">Каркас проекта: {BUSINESSES.length} бизнесов в конфиге.</p>
    </div>
  );
}
