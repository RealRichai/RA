"use client";

import * as React from "react";

type Props = {
  title: string;
  description: string;
  icon?: React.ReactNode;
};

export function FeatureCard({ title, description, icon }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
          {icon ?? <span className="text-sm font-bold">RR</span>}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-sm text-gray-600">{description}</div>
        </div>
      </div>
    </div>
  );
}

export default FeatureCard;
