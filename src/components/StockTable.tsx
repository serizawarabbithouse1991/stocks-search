import type { StockData } from "../types";

interface Props {
  stocks: StockData[];
  tickerNames: Record<string, string>;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

export default function StockTable({ stocks, tickerNames }: Props) {
  if (!stocks.length) return <div className="loading">データがありません</div>;

  // 全銘柄の全日付をまとめる
  const allDates = new Set<string>();
  const dataMap: Record<string, Record<string, any>> = {};

  for (const s of stocks) {
    dataMap[s.ticker] = {};
    for (const r of s.data) {
      allDates.add(r.date);
      dataMap[s.ticker][r.date] = r;
    }
  }

  const sortedDates = Array.from(allDates).sort().reverse(); // 新しい日付が上

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>日付</th>
            {stocks.map((s) => (
              <th key={s.ticker} colSpan={2}>
                {tickerNames[s.ticker] || s.ticker}
              </th>
            ))}
          </tr>
          <tr>
            <th></th>
            {stocks.map((s) => (
              <>
                <th key={`${s.ticker}-close`}>終値</th>
                <th key={`${s.ticker}-vol`}>出来高</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedDates.map((date) => (
            <tr key={date}>
              <td>{date}</td>
              {stocks.map((s) => {
                const d = dataMap[s.ticker]?.[date];
                return (
                  <>
                    <td key={`${s.ticker}-${date}-c`}>{d ? fmt(d.close) : "-"}</td>
                    <td key={`${s.ticker}-${date}-v`}>
                      {d?.volume != null ? d.volume.toLocaleString() : "-"}
                    </td>
                  </>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
