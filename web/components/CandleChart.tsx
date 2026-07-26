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
import { palette } from "@/lib/palette";

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
        textColor: palette.ink3,
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
      // The crosshair reads the axes, not the market, so it takes the brand violet — a green
      // readout would imply a direction the cursor position doesn't have.
      crosshair: {
        horzLine: { labelBackgroundColor: palette.coil600 },
        vertLine: { labelBackgroundColor: palette.coil600 },
      },
      handleScale: false,
      handleScroll: false,
    });
    chartRef.current = chart;

    // Candles keep the conventional up/down reading — traders parse it pre-attentively and
    // re-mapping it to brand colours would cost more than it gains. Only the hexes move, onto the
    // palette's cyan-leaning mint and warm red.
    const series = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
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
      <div className="mb-2 flex items-center justify-between px-1 text-xs text-ink-4">
        <span>Marketcap · {ethUsd > 0 ? "USD" : "ETH"}</span>
        <span>on-chain candles</span>
      </div>
      <div ref={ref} className="w-full" />
    </div>
  );
}
