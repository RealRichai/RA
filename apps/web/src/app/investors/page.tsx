'use client';

import Link from 'next/link';
import { BarChart3, Search, ArrowRight, TrendingUp, PieChart, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/layout/header';

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-luxury-gold to-luxury-bronze rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BarChart3 className="h-10 w-10 text-white" />
          </div>

          <h1 className="text-4xl md:text-5xl font-display font-bold text-surface-900 mb-4">
            For Investors
          </h1>

          <p className="text-xl text-surface-600 max-w-2xl mx-auto mb-8">
            Discover high-yield investment opportunities in NYC real estate.
            This feature is coming soon.
          </p>

          <Button size="lg" asChild>
            <Link href="/listings">
              <Search className="h-5 w-5 mr-2" />
              Browse Rentals Instead
              <ArrowRight className="h-5 w-5 ml-2" />
            </Link>
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-16">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-surface-900 mb-2">Market Insights</h3>
              <p className="text-sm text-surface-500">
                Real-time data on NYC rental market trends and yields
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <PieChart className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-surface-900 mb-2">Portfolio Analytics</h3>
              <p className="text-sm text-surface-500">
                Track ROI, cash flow, and property performance
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Target className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="font-semibold text-surface-900 mb-2">Deal Flow</h3>
              <p className="text-sm text-surface-500">
                Access exclusive off-market investment opportunities
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 p-8 bg-luxury-champagne/30 rounded-2xl text-center">
          <p className="text-surface-600 mb-2">Interested in investment opportunities?</p>
          <p className="text-sm text-surface-500">
            Check back soon or create an account to get early access to our investor tools.
          </p>
        </div>
      </main>
    </div>
  );
}
