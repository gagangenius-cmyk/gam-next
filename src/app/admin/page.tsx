'use client';

import LeadAppointmentDashboard from '@/components/dashboard/LeadAppointmentDashboard';
import UsageHistoryCard from '@/components/dashboard/UsageHistoryCard';



export default function AdminDashboard() {
  

  return (
   
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Lead + Appointment Dashboard */}
        <div className="mb-8">
          <LeadAppointmentDashboard />
        </div>

        <div className="mb-8 max-w-xl">
          <UsageHistoryCard />
        </div>

        {/* Stats Grid */}
        </main>
  );
}
