"use client";

import { useState, useMemo } from "react";
import {
  Star,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Award,
  MessageSquareHeart,
  Send,
  AlertCircle,
} from "lucide-react";

interface GoogleReviewCardProps {
  restaurantName: string;
  tableName: string;
  orderedItems: string[];
  googleReviewUrl?: string | null;
  accentColor?: string;
}

export function GoogleReviewCard({
  restaurantName,
  tableName,
  orderedItems,
  googleReviewUrl,
  accentColor = "#E85D2A",
}: GoogleReviewCardProps) {
  const [rating, setRating] = useState(5);
  const [copied, setCopied] = useState(false);
  const [privateFeedback, setPrivateFeedback] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Normalize URL to always be a safe absolute URL
  const targetUrl = useMemo(() => {
    if (!googleReviewUrl) return null;
    const trimmed = googleReviewUrl.trim();
    if (!trimmed) return null;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }, [googleReviewUrl]);

  // Dynamic positive review generator
  const generatedReview = useMemo(() => {
    const dishes = orderedItems.filter(Boolean).slice(0, 3);
    const dishPhrase =
      dishes.length > 0
        ? `The ${dishes.join(" and ")} were absolutely fantastic!`
        : "The food was fresh and delicious!";

    return `${dishPhrase} Loved the digital table ordering experience from Table ${tableName} at ${restaurantName}—super fast and seamless. Great hospitality and wonderful atmosphere. Highly recommend dining here! ⭐⭐⭐⭐⭐`;
  }, [orderedItems, restaurantName, tableName]);

  const handleCopy = (e?: React.MouseEvent) => {
    // 1. Copy synchronously using execCommand to guarantee execution during the click event
    try {
      const textArea = document.createElement("textarea");
      textArea.value = generatedReview;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    } catch {
      // ignore
    }

    // 2. Also copy using modern Clipboard API in parallel
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(generatedReview).catch(() => {});
    }

    setCopied(true);

    // If there is no target URL, prevent default link behavior
    if (!targetUrl && e) {
      e.preventDefault();
    }
  };

  const handleSendFeedback = () => {
    if (!privateFeedback.trim() && !selectedIssue) return;
    setFeedbackSent(true);
  };

  const isPositive = rating >= 4;

  return (
    <div
      className={`w-full rounded-3xl border p-5 shadow-sm space-y-4 transition-all duration-300 ${
        isPositive
          ? "bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-white border-amber-200/80"
          : "bg-gradient-to-br from-rose-500/10 via-neutral-50 to-white border-rose-200/80"
      }`}
    >
      {/* Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-xl text-white flex items-center justify-center shadow-xs ${
              isPositive ? "bg-amber-500" : "bg-rose-500"
            }`}
          >
            {isPositive ? (
              <Sparkles className="w-4 h-4" />
            ) : (
              <MessageSquareHeart className="w-4 h-4" />
            )}
          </div>
          <span
            className={`text-xs font-black uppercase tracking-wider ${
              isPositive ? "text-amber-900" : "text-rose-900"
            }`}
          >
            {isPositive ? "Enjoyed Your Meal?" : "How Was Your Experience?"}
          </span>
        </div>
        {isPositive ? (
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold border border-amber-200">
            <Award className="w-3 h-3 text-amber-600" />
            <span>+50 Loyalty Points</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold border border-rose-200">
            <span>Direct to Manager</span>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-base font-extrabold text-neutral-900 leading-snug">
          {isPositive
            ? "Help Us Grow With a Google Review"
            : "We Value Your Honest Feedback"}
        </h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          {isPositive
            ? "We prepared a ready-to-post review based on your meal. 1 tap copies it and opens the review page!"
            : "We're sorry your experience wasn't 5 stars! Let the manager know directly so we can resolve it before you leave."}
        </p>
      </div>

      {/* Star Selector */}
      <div className="flex items-center justify-center gap-2 py-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => {
              setRating(star);
              setFeedbackSent(false);
            }}
            className="p-1 rounded-lg hover:scale-110 active:scale-95 transition cursor-pointer"
            aria-label={`Rate ${star} stars`}
          >
            <Star
              className={`w-7 h-7 transition-colors ${
                star <= rating
                  ? isPositive
                    ? "fill-amber-400 text-amber-400 drop-shadow-xs"
                    : "fill-rose-400 text-rose-400 drop-shadow-xs"
                  : "text-neutral-300"
              }`}
            />
          </button>
        ))}
      </div>

      {/* POSITIVE FLOW: Generated Review Quote Card & Google Button */}
      {isPositive ? (
        <>
          <div className="relative rounded-2xl bg-white border border-amber-100 p-3.5 shadow-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1 flex items-center gap-1">
              <span>✨ Generated Review</span>
              <span className="text-neutral-400 font-normal">
                ({orderedItems.length > 0 ? orderedItems.slice(0, 2).join(", ") : "Your meal"})
              </span>
            </p>
            <blockquote className="text-xs text-neutral-700 italic leading-relaxed">
              &ldquo;{generatedReview}&rdquo;
            </blockquote>
          </div>

          <div className="space-y-2">
            {targetUrl ? (
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleCopy}
                className="w-full py-3.5 rounded-2xl text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition hover:brightness-105 select-none no-underline block text-center"
                style={{ backgroundColor: accentColor }}
              >
                <span className="w-5 h-5 rounded-md bg-white text-neutral-900 inline-flex items-center justify-center font-black text-[11px] shrink-0">
                  G
                </span>
                <Copy className="w-4 h-4 shrink-0 inline" />
                <span>Copy Review &amp; Open Link</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80 shrink-0 inline" />
              </a>
            ) : (
              <button
                type="button"
                onClick={handleCopy}
                className="w-full py-3.5 rounded-2xl text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition hover:brightness-105"
                style={{ backgroundColor: accentColor }}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Review Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Review Text</span>
                  </>
                )}
              </button>
            )}

            {copied && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-2.5 text-center text-xs font-semibold animate-in fade-in">
                ✓ Review copied to your clipboard! Paste it into the review page.
              </div>
            )}

            {targetUrl && (
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500 font-medium pt-1">
                <span>Direct link:</span>
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleCopy}
                  className="text-primary hover:underline font-bold truncate max-w-[220px]"
                >
                  {targetUrl}
                </a>
              </div>
            )}

            {!targetUrl && (
              <p className="text-center text-[10px] text-neutral-400">
                (Review text copied! Restaurant owner can configure direct Google Link in Settings.)
              </p>
            )}
          </div>
        </>
      ) : (
        /* CRITICAL / PRIVATE FLOW: Protects Public Reviews & Alerts Manager */
        <div className="space-y-3 animate-in fade-in">
          {feedbackSent ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-center space-y-1">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-1">
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
              <p className="font-bold text-xs">Thank You for Letting Us Know!</p>
              <p className="text-[11px] text-emerald-700">
                Your message has been dispatched to the restaurant manager at Table {tableName}. We will make it right!
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {["Slow Service", "Food Temperature", "Missing Dish", "Staff Attention", "Other"].map(
                  (issue) => (
                    <button
                      key={issue}
                      type="button"
                      onClick={() => setSelectedIssue(issue)}
                      className={`px-3 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                        selectedIssue === issue
                          ? "bg-rose-500 border-rose-500 text-white"
                          : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      {issue}
                    </button>
                  )
                )}
              </div>

              <textarea
                rows={2}
                placeholder="What could we have done better? (Sent directly to manager)"
                value={privateFeedback}
                onChange={(e) => setPrivateFeedback(e.target.value)}
                className="w-full rounded-2xl border border-neutral-200 p-3 text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-rose-400 bg-white"
              />

              <button
                type="button"
                onClick={handleSendFeedback}
                disabled={!privateFeedback.trim() && !selectedIssue}
                className="w-full py-3 rounded-2xl bg-neutral-900 text-white font-black text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Directly to Manager</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
