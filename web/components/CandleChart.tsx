"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/useActivity";

/**
 * DexScreener-style candlestick chart of a token's marketcap, built from on-chain
 * Trade events (bonding-curve phase). Values are ETH marketcap converted to USD
 * when a price is available.
 */
export function CandleChart({ candles, ethUsd }: { candles: Candle[]; ethUsd: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b96a5",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { horzLine: { labelBackgroundColor: "#12c26a" }, vertLine: { labelBackgroundColor: "#12c26a" } },
      handleScale: false,
      handleScroll: false,
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22e584",
      downColor: "#f87171",
      borderUpColor: "#22e584",
      borderDownColor: "#f87171",
      wickUpColor: "#22e584",
      wickDownColor: "#f87171",
    });

    const mult = ethUsd > 0 ? ethUsd : 1;
    series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open * mult,
        high: c.high * mult,
        low: c.low * mult,
        close: c.close * mult,
      })),
    );
    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, ethUsd]);

  return (
    <div className="glass p-3">
      <div className="mb-2 flex items-center justify-between px-1 text-xs text-white/40">
        <span>Marketcap · {ethUsd > 0 ? "USD" : "ETH"}</span>
        <span>on-chain candles</span>
      </div>
      <div ref={ref} className="w-full" />
    </div>
  );
}
