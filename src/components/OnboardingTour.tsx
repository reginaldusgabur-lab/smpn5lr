'use client';

import React from 'react';
import { Joyride, Step } from 'react-joyride';
import { useUser } from '@/firebase';

// Definisikan langkah-langkah tur untuk setiap peran
const stepsByRole: Record<string, Step[]> = {
  kepala_sekolah: [
    {
      target: '#nav-laporan',
      content: 'Di menu ini, Anda dapat melihat dan mengunduh semua riwayat absensi guru dan pegawai.',
    },
    {
      target: '#nav-izin-kepsek',
      content: 'Di sini Anda dapat meninjau dan memberikan persetujuan untuk pengajuan izin atau sakit dari staf.',
    },
    {
      target: '#nav-pengaturan',
      content: 'Gunakan menu ini untuk mengubah kata sandi atau informasi pribadi Anda.',
    },
  ],
  guru: [
    {
      target: '#nav-laporan',
      content: 'Lihat semua riwayat absensi Anda di sini, termasuk rekap bulanan.',
    },
    {
      target: '#nav-izin',
      content: 'Ajukan izin atau sakit dengan mudah melalui formulir di menu ini.',
    },
    {
      target: '#nav-pengaturan',
      content: 'Ubah kata sandi atau informasi pribadi Anda kapan saja di sini.',
    },
  ],
  pegawai: [
    {
      target: '#nav-laporan',
      content: 'Lihat semua riwayat absensi Anda di sini, termasuk rekap bulanan.',
    },
    {
      target: '#nav-izin',
      content: 'Ajukan izin atau sakit dengan mudah melalui formulir di menu ini.',
    },
    {
      target: '#nav-pengaturan',
      content: 'Ubah kata sandi atau informasi pribadi Anda kapan saja di sini.',
    },
  ],
  siswa: [
    {
      target: '#nav-laporan',
      content: 'Lihat semua riwayat absensi Anda di sini.',
    },
    {
      target: '#nav-absen',
      content: 'Lakukan absensi setiap hari melalui menu ini dengan memindai QR Code.',
    },
    {
      target: '#nav-izin',
      content: 'Ajukan izin atau sakit jika berhalangan hadir melalui formulir di sini.',
    },
    {
      target: '#nav-pengaturan',
      content: 'Ubah kata sandi atau informasi pribadi Anda di sini.',
    },
  ],
};

interface OnboardingTourProps {
  run: boolean;
  onTourComplete: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ run, onTourComplete }) => {
  const { user } = useUser();
  const steps = user?.role ? stepsByRole[user.role] : [];

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      callback={({ status }) => {
        if (['finished', 'skipped'].includes(status)) {
          onTourComplete();
        }
      }}
      styles={{
        options: {
          arrowColor: '#fff',
          backgroundColor: '#fff',
          primaryColor: '#14b8a6', // teal-500
          textColor: '#334155', // slate-700
          zIndex: 1000,
        },
        tooltip: {
          borderRadius: '0.5rem',
          padding: '1rem',
        },
      }}
    />
  );
};
