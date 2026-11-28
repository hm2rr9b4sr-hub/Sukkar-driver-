"use client";
import { useEffect, useState } from "react";
import {
  cashInHand, driverSubmitCashHandover, fetchMyCashHandovers, fetchReceivingAccounts, uploadCashHandoverProof,
  UICashHandover, UIDelivery, UIReceivingAccount,
} from "@/lib/data";

// 0088: «المبلغ الذي معك لسُكّر» + حوالة واحدة تغطيه كله إلى أحد حسابات سُكّر (الحوالة فقط حالياً).
// المبلغ = الباقي على المنتج لكل طلب سلّمته ولم يُؤكَّد؛ رسم التوصيل لك ولا يدخل هنا.
const ERRORS: Record<string, string> = {
  "handover-already-pending": "لديك حوالة بانتظار تأكيد سُكّر",
  "reference-required": "اكتب رقم الحوالة",
  "invalid-account": "اختر حساب سُكّر الذي حوّلت إليه",
  "invalid-proof": "تعذّر حفظ صورة الإيصال، أعد المحاولة",
  "nothing-to-hand-over": "لا يوجد مبلغ معك لسُكّر",
};
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export default function CashHandoverCard({ history, onDone }: { history: UIDelivery[]; onDone: () => void }) {
  const [accounts, setAccounts] = useState<UIReceivingAccount[]>([]);
  const [handovers, setHandovers] = useState<UICashHandover[]>([]);
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => {
    fetchReceivingAccounts().then(setAccounts);
    fetchMyCashHandovers(5).then(setHandovers);
  };
  // تُعاد مع كل تحديث لسجل التوصيلات (مثلاً عند العودة للتطبيق) — وإلا تبقى حوالة رُفضت ظاهرة «بانتظار التأكيد»
  // ويختفي زر التحويل رغم عودة المبلغ للعهدة (وُجد باختبار حي 2026-11-28)
  useEffect(load, [history]);

  const inHand = cashInHand(history);
  const pending = handovers.find((h) => h.status === "pending");
  const last = handovers[0];

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 1500); } catch { /* النسخ غير متاح: الرقم ظاهر للقراءة */ }
  }

  async function submit() {
    setError(null);
    if (!accountId) { setError(ERRORS["invalid-account"]); return; }
    if (reference.trim().length < 3) { setError(ERRORS["reference-required"]); return; }
    setBusy(true);
    let proofPath: string | null = null;
    if (proof) {
      const up = await uploadCashHandoverProof(proof);
      if (up.error) { setBusy(false); setError(ERRORS["invalid-proof"]); return; }
      proofPath = up.path;
    }
    const r = await driverSubmitCashHandover(accountId, reference.trim(), proofPath);
    setBusy(false);
    if (!r.ok) { setError(ERRORS[r.error ?? ""] ?? "تعذّر إرسال الحوالة، أعد المحاولة"); return; }
    setOpen(false); setReference(""); setProof(null); setAccountId("");
    load();
    onDone();
  }

  return (
    <div className="rounded-2xl p-4 border flex flex-col gap-3" style={{ background: "#FEF3C7", borderColor: "var(--gold)" }} data-testid="cash-handover-card">
      <div>
        <p className="text-sm font-semibold">المبلغ الذي معك لسُكّر</p>
        <p className="text-2xl font-black" style={{ color: "var(--gold)" }}>{fmt(inHand.amount)} ريال</p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {inHand.count > 0 ? `من ${inHand.count} طلب · رسوم التوصيل لك ولا تدخل هنا` : "لا يوجد مبلغ عليك الآن"}
        </p>
      </div>

      {pending && (
        <div className="rounded-xl p-3 bg-white border" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm font-semibold">⏳ بانتظار تأكيد سُكّر: {fmt(pending.amount)} ريال</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>{pending.provider} · رقم الحوالة {pending.reference}</p>
        </div>
      )}

      {!pending && last?.status === "rejected" && inHand.amount > 0 && (
        <div className="rounded-xl p-3 bg-red-50 border border-red-200">
          <p className="font-bold text-red-700 text-sm">❌ لم تصل حوالتك السابقة</p>
          {last.rejectionReason && <p className="text-sm text-red-600 mt-1">{last.rejectionReason}</p>}
        </div>
      )}

      {!pending && inHand.amount > 0 && !open && (
        <button onClick={() => setOpen(true)} className="w-full py-3.5 rounded-2xl font-bold text-white" style={{ background: "var(--cocoa, #4A2C2A)" }}>
          💰 حوّلت المبلغ لسُكّر
        </button>
      )}

      {open && (
        <div className="flex flex-col gap-3 rounded-xl p-3 bg-white border" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm font-semibold">حوّلت {fmt(inHand.amount)} ريال إلى:</p>
          {accounts.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>لا توجد حسابات متاحة — تواصل مع فريق سُكّر</p>}
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2 rounded-xl p-2 border" style={{ borderColor: accountId === a.id ? "var(--gold)" : "var(--border)" }}>
              <input type="radio" name="acc" checked={accountId === a.id} onChange={() => setAccountId(a.id)} className="w-5 h-5" />
              <span className="flex-1 text-sm">
                <span className="font-semibold">{a.provider}</span> · {a.accountName}
                <span className="block font-mono text-base" dir="ltr">{a.accountNumber}</span>
              </span>
              <button type="button" onClick={(e) => { e.preventDefault(); copy(a.accountNumber); }}
                className="text-xs font-semibold px-2 py-1 rounded-lg border" style={{ borderColor: "var(--border)" }}>
                {copied === a.accountNumber ? "✓ نُسخ" : "نسخ"}
              </button>
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">رقم الحوالة</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} inputMode="text" dir="ltr"
              className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }} data-testid="handover-reference" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">📷 صورة الإيصال (اختيارية)</span>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="text-xs" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="flex-1 py-3 rounded-2xl font-bold text-white disabled:opacity-60" style={{ background: "#16A34A" }}>
              {busy ? "جارٍ الإرسال..." : "إرسال"}
            </button>
            <button onClick={() => { setOpen(false); setError(null); }} disabled={busy} className="px-4 py-3 rounded-2xl font-semibold border" style={{ borderColor: "var(--border)" }}>
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
