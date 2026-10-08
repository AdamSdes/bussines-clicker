import { Card } from '../ui';

export default function InvestScreen() {
  return (
    <Card className="p-6 text-center text-ink-dim">
      <div className="text-4xl">📈</div>
      <div className="mt-2 font-semibold text-ink">Биржа открывается на следующем этапе</div>
      <div className="mt-1 text-sm">Акции, крипта, недвижимость и облигации по реальной истории.</div>
    </Card>
  );
}
