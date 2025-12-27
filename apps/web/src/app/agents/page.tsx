'use client';

import Link from 'next/link';
import { Users, Search, ArrowRight, Star, Shield, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/layout/header';

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-luxury-gold to-luxury-bronze rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Users className="h-10 w-10 text-white" />
          </div>

          <h1 className="text-4xl md:text-5xl font-display font-bold text-surface-900 mb-4">
            Find an Agent
          </h1>

          <p className="text-xl text-surface-600 max-w-2xl mx-auto mb-8">
            Connect with top-rated real estate agents in New York City.
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
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Star className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="font-semibold text-surface-900 mb-2">Top-Rated Agents</h3>
              <p className="text-sm text-surface-500">
                Browse agents with verified reviews and track records
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-surface-900 mb-2">Verified Professionals</h3>
              <p className="text-sm text-surface-500">
                All agents are licensed and background-checked
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-surface-900 mb-2">Quick Response</h3>
              <p className="text-sm text-surface-500">
                Get matched with agents who respond within 24 hours
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 p-8 bg-luxury-champagne/30 rounded-2xl text-center">
          <p className="text-surface-600 mb-2">Want to be notified when this launches?</p>
          <p className="text-sm text-surface-500">
            Check back soon or continue browsing available rentals.
          </p>
        </div>
      </main>
    </div>
  );
}
