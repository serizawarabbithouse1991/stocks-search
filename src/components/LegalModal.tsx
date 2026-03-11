import { useEffect, useRef } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function LegalModal({ isOpen, onClose, title, children }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="legal-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="legal-modal">
        <div className="legal-modal-header">
          <h2>{title}</h2>
          <button className="legal-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="legal-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <>
      <p className="legal-updated">最終更新日: 2026年3月11日</p>

      <h3>1. はじめに</h3>
      <p>
        StocksView（以下「本サービス」）は、株式データの閲覧・比較を目的とした個人開発のツールです。
        本プライバシーポリシーは、本サービスにおける情報の取扱いについて説明します。
      </p>

      <h3>2. 収集する情報</h3>
      <p>本サービスは、以下の点において最小限の情報のみを扱います。</p>
      <ul>
        <li><strong>個人情報の収集はありません。</strong>アカウント登録、ログイン、メールアドレス等の入力は一切不要です。</li>
        <li><strong>ローカルストレージ:</strong> テーマ設定（ライト/ダーク）およびウォッチリストのデータは、お使いのブラウザのローカルストレージにのみ保存されます。これらのデータは外部サーバーに送信されません。</li>
        <li><strong>株価データの取得:</strong> ユーザーが入力した銘柄コードに基づき、バックエンドサーバーを経由してYahoo Finance等の外部APIから株価データを取得します。</li>
      </ul>

      <h3>3. Cookieおよびトラッキング</h3>
      <p>本サービスはCookie、アクセス解析ツール、広告トラッキングを一切使用しません。</p>

      <h3>4. データの共有</h3>
      <p>本サービスはユーザーの情報を第三者と共有、販売、提供することはありません。</p>

      <h3>5. 外部サービスとの連携</h3>
      <p>
        株価データの取得にあたり、Yahoo Finance等の外部APIを利用しています。
        これらの外部サービスには、それぞれ独自のプライバシーポリシーが適用されます。
      </p>

      <h3>6. データの保管</h3>
      <p>
        本サービスはサーバー側にユーザー固有のデータを保存しません。
        すべてのユーザー設定はお使いの端末のブラウザ内にのみ保存されます。
      </p>

      <h3>7. ポリシーの変更</h3>
      <p>本ポリシーは予告なく変更される場合があります。変更後も本サービスを継続利用した場合、変更に同意したものとみなします。</p>
    </>
  );
}

export function TermsOfService() {
  return (
    <>
      <p className="legal-updated">最終更新日: 2026年3月11日</p>

      <h3>1. サービスの概要</h3>
      <p>
        StocksView（以下「本サービス」）は、公開されている株式市場データの閲覧・比較・分析を補助する目的で提供される個人開発のツールです。
      </p>

      <h3>2. 免責事項（重要）</h3>
      <ul>
        <li>
          <strong>投資助言ではありません。</strong>
          本サービスで表示される情報（株価、チャート、テクニカル指標等）は、いかなる金融商品の売買を推奨・助言するものではありません。
        </li>
        <li>
          <strong>データの正確性について。</strong>
          本サービスで表示されるデータはYahoo Finance等の外部ソースから取得しています。
          データの正確性、完全性、即時性について、開発者は一切保証しません。
          データの遅延、誤り、欠落が発生する場合があります。
        </li>
        <li>
          <strong>損害に対する責任の否認。</strong>
          本サービスの利用、または利用不能に起因して生じたいかなる直接的・間接的・偶発的・特別・結果的損害（利益の損失、データの損失、投資損失等を含むがこれに限定されない）について、
          開発者は一切の責任を負いません。
        </li>
        <li>
          <strong>投資判断は自己責任です。</strong>
          投資に関する最終的な判断は、ユーザー自身の責任において行ってください。
          必要に応じて、資格を持つファイナンシャルアドバイザーにご相談ください。
        </li>
      </ul>

      <h3>3. サービスの提供</h3>
      <ul>
        <li>本サービスは「現状のまま（AS IS）」で提供されます。商品性、特定目的への適合性、第三者の権利の非侵害等、明示または黙示を問わず、いかなる保証も行いません。</li>
        <li>本サービスは予告なく変更、中断、終了する場合があります。</li>
        <li>外部APIの仕様変更、障害、レート制限等により、データ取得が一時的または恒久的に不能となる場合があります。</li>
      </ul>

      <h3>4. 禁止事項</h3>
      <ul>
        <li>本サービスを利用した自動大量リクエスト（スクレイピング等）</li>
        <li>本サービスの逆コンパイル、リバースエンジニアリング（オープンソースライセンスで許可される範囲を除く）</li>
        <li>本サービスを利用した違法行為</li>
      </ul>

      <h3>5. 知的財産</h3>
      <p>
        本サービスのソースコードはGitHub上で公開されていますが、株価データの著作権・知的財産権は
        各データ提供元（Yahoo Finance、JPX等）に帰属します。
      </p>

      <h3>6. 準拠法</h3>
      <p>本規約は日本法に準拠し、日本法に従って解釈されるものとします。</p>

      <h3>7. 規約の変更</h3>
      <p>本規約は予告なく変更される場合があります。変更後も本サービスを継続利用した場合、変更後の規約に同意したものとみなします。</p>
    </>
  );
}
