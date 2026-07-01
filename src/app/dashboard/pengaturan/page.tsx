'use client';

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useDoc, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2, Camera, Eye, EyeOff, UserCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { updatePassword, updateProfile } from 'firebase/auth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

export default function PengaturanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [nisn, setNisn] = useState('');
  const [position, setPosition] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isReportSaving, setIsReportSaving] = useState(false);
  const [governmentAgency, setGovernmentAgency] = useState('');
  const [educationAgency, setEducationAgency] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [address, setAddress] = useState('');
  const [headmasterName, setHeadmasterName] = useState('');
  const [headmasterNip, setHeadmasterNip] = useState('');
  const [reportCity, setReportCity] = useState('');
  const [academicYear, setAcademicYear] = useState('');

  const [isNotificationSaving, setIsNotificationSaving] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationContent, setNotificationContent] = useState('');
  const [isNotificationActive, setIsNotificationActive] = useState(false);
  const [notificationInterval, setNotificationInterval] = useState(3);

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const schoolConfigRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'schoolConfig', 'default');
  }, [firestore, user]);

  const { data: userData, isLoading: isUserDataLoading } = useDoc<{ 
      name: string;
      role: string;
      email: string;
      nip?: string;
      nisn?: string;
      position?: string;
      photoURL?: string;
  }>(user, userDocRef);

  const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc<{
      governmentAgency: string;
      educationAgency: string;
      schoolName: string;
      address: string;
      headmasterName: string;
      headmasterNip: string;
      reportCity: string;
      academicYear: string;
      notificationTitle?: string;
      notificationContent?: string;
      isNotificationActive?: boolean;
      notificationInterval?: number;
  }>(user, schoolConfigRef);

  useEffect(() => {
    if (userData) {
      setName(userData.name || '');
      setNip(userData.nip || '');
      setNisn(userData.nisn || '');
      setPosition(userData.position || '');
    }
  }, [userData]);

  useEffect(() => {
    if (schoolConfigData) {
      setGovernmentAgency(schoolConfigData.governmentAgency ?? 'PEMERINTAH KABUPATEN MANGGARAI');
      setEducationAgency(schoolConfigData.educationAgency ?? 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA');
      setSchoolName(schoolConfigData.schoolName ?? 'SMP NEGERI 5 LANGKE REMBONG');
      setAddress(schoolConfigData.address ?? 'Jl. Ranaka, Karot, Langke Rembong, Kabupaten Manggarai, Nusa Tenggara Tim.');
      setHeadmasterName(schoolConfigData.headmasterName ?? 'Fransiskus Sales, S.Pd');
      setHeadmasterNip(schoolConfigData.headmasterNip ?? '196805121994121004');
      setReportCity(schoolConfigData.reportCity ?? 'Mando');
      setAcademicYear(schoolConfigData.academicYear ?? '');
      
      setNotificationTitle(schoolConfigData.notificationTitle ?? '');
      setNotificationContent(schoolConfigData.notificationContent ?? '');
      setIsNotificationActive(schoolConfigData.isNotificationActive ?? false);
      setNotificationInterval(schoolConfigData.notificationInterval ?? 3);
    }
  }, [schoolConfigData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 750 * 1024) {
          toast({
              variant: 'destructive',
              title: 'File terlalu besar',
              description: 'Ukuran foto profil tidak boleh melebihi 750KB.',
          });
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userDocRef) return;
    setIsProfileLoading(true);

    try {
      const authUpdates: { displayName?: string } = {};
      const firestoreUpdates: any = {};

      if (name && name !== userData?.name) {
        authUpdates.displayName = name;
        firestoreUpdates.name = name;
      }
      if (nip !== userData?.nip) firestoreUpdates.nip = nip;
      if (nisn !== userData?.nisn) firestoreUpdates.nisn = nisn;
      if (position !== userData?.position) firestoreUpdates.position = position;
      if (photoPreview) {
        firestoreUpdates.photoURL = photoPreview;
      }

      const updatePromises: Promise<any>[] = [];
      if (Object.keys(authUpdates).length > 0) {
        updatePromises.push(updateProfile(user, authUpdates));
      }
      if (Object.keys(firestoreUpdates).length > 0) {
        updatePromises.push(updateDoc(userDocRef, firestoreUpdates));
      }
      
      if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
          toast({
            title: 'Berhasil',
            description: 'Profil Anda telah berhasil diperbarui.',
          });
      }
      
      setPhotoPreview(null);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: 'Terjadi kesalahan saat memperbarui profil.',
      });
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Konfirmasi password baru tidak cocok.' });
      return;
    }
    if (newPassword.length < 6) {
        toast({ variant: 'destructive', title: 'Gagal', description: 'Password minimal harus 6 karakter.' });
        return;
    }
    setIsPasswordLoading(true);
    if (user) {
      try {
        await updatePassword(user, newPassword);
        toast({ title: 'Berhasil', description: 'Password telah berhasil diubah.' });
        setNewPassword('');
        setConfirmPassword('');
      } catch (error: any) {
        toast({ 
            variant: 'destructive', 
            title: 'Gagal', 
            description: 'Sesi Anda mungkin sudah berakhir. Silakan login ulang.',
        });
      } finally {
        setIsPasswordLoading(false);
      }
    }
  };

  const handleReportSettingsSave = () => {
    if (!schoolConfigRef) return;
    setIsReportSaving(true);
    setDocumentNonBlocking(schoolConfigRef, {
      governmentAgency,
      educationAgency,
      schoolName,
      address,
      headmasterName,
      headmasterNip,
      reportCity,
      academicYear,
    }, { merge: true });
    toast({
      title: 'Disimpan',
      description: 'Data laporan PDF telah diperbarui.',
    });
    setIsReportSaving(false);
  };

  const handleNotificationSettingsSave = () => {
    if (!schoolConfigRef) return;
    setIsNotificationSaving(true);
    setDocumentNonBlocking(schoolConfigRef, {
      notificationTitle,
      notificationContent,
      isNotificationActive,
      notificationInterval: Number(notificationInterval),
    }, { merge: true });
    toast({
      title: 'Disimpan',
      description: 'Pemberitahuan sistem telah diperbarui.',
    });
    setIsNotificationSaving(false);
  };

  const getInitials = (name: string | undefined | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  const isLoading = isUserDataLoading || isAuthLoading || isConfigLoading;
  const isAdmin = userData?.role === 'admin';
  const isTeacherOrStaff = userData?.role === 'guru' || userData?.role === 'pegawai' || userData?.role === 'kepala_sekolah';
  const isStudent = userData?.role === 'siswa';
  const currentPhoto = photoPreview || userData?.photoURL || user?.photoURL;

  const positions = isTeacherOrStaff ? ["PNS", "PPPK", "Honorer", "PW"] : ["Pelajar Aktif"];

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 pb-20">
      <form onSubmit={handleProfileUpdate}>
        <Card className="overflow-hidden bg-card border border-muted-foreground/10 shadow-none rounded-xl">
          <CardHeader className="p-6 text-primary border-b border-muted-foreground/5 bg-muted/20">
            <div className="flex items-center gap-3">
              <UserCircle className="h-5 w-5" />
              <div>
                <CardTitle className="font-bold text-sm tracking-tight uppercase">Profil Pengguna</CardTitle>
                <CardDescription className="text-muted-foreground font-medium">Informasi identitas personil di sistem.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 pt-8">
            <div className="flex flex-col sm:flex-row items-center gap-6 pb-2">
                <div className="relative shrink-0">
                  <Avatar className="h-24 w-24 border-2 border-primary/10 shadow-none">
                    <AvatarImage src={currentPhoto ?? undefined} alt="Avatar" />
                    <AvatarFallback className="bg-primary/5 text-primary text-xl font-bold">{getInitials(name)}</AvatarFallback>
                  </Avatar>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="absolute -bottom-1 -right-1 rounded-full h-8 w-8 border-2 border-background bg-primary text-white hover:bg-primary/90 shadow-lg"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg"
                    onChange={handleFileChange}
                  />
                </div>
                <div className="text-center sm:text-left space-y-1">
                   <h3 className="font-bold text-lg text-primary">{name || 'Nama Belum Diatur'}</h3>
                   <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{userData?.role.replace('_', ' ')}</p>
                   <p className="text-[10px] text-muted-foreground/60 italic font-bold">PNG atau JPG (Maks 750KB).</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-xs font-bold ml-1 text-muted-foreground">Nama Lengkap</Label>
                    <Input id="fullName" className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 font-bold focus:bg-background" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-bold ml-1 text-muted-foreground">Alamat Email (Akun)</Label>
                    <Input id="email" type="email" className="h-12 rounded-xl bg-muted/50 border-muted-foreground/10 font-bold opacity-60 cursor-not-allowed" value={userData?.email || ''} readOnly />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {isTeacherOrStaff && (
                  <div className="space-y-2">
                      <Label htmlFor="nip" className="text-xs font-bold ml-1 text-muted-foreground">Nomor Induk Pegawai (NIP)</Label>
                      <Input id="nip" className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 font-bold focus:bg-background" value={nip} onChange={(e) => setNip(e.target.value)} placeholder="Masukkan NIP Anda" />
                  </div>
                )}
                {isStudent && (
                  <div className="space-y-2">
                      <Label htmlFor="nisn" className="text-xs font-bold ml-1 text-muted-foreground">NISN</Label>
                      <Input id="nisn" className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 font-bold focus:bg-background" value={nisn} onChange={(e) => setNisn(e.target.value)} placeholder="Nomor Induk Siswa" />
                  </div>
                )}
                {(isTeacherOrStaff || isStudent) && (
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-xs font-bold ml-1 text-muted-foreground">Status Kepegawaian</Label>
                    <Select onValueChange={setPosition} value={position}>
                        <SelectTrigger className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 font-bold focus:bg-background">
                            <SelectValue placeholder="Pilih status" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-xl">
                            {positions.map(p => (
                                <SelectItem key={p} value={p} className="rounded-lg font-bold text-xs">{p}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  </div>
                )}
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-5 bg-muted/5">
            <Button type="submit" className="font-bold rounded-xl h-12 px-10 shadow-none active:scale-95 transition-all" disabled={isProfileLoading}>
                {isProfileLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Perbarui Profil
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card className="overflow-hidden bg-card border border-muted-foreground/10 shadow-none rounded-xl">
        <CardHeader className="p-6 text-primary border-b border-muted-foreground/5 bg-muted/20">
          <CardTitle className="font-bold text-sm tracking-tight uppercase">Ganti Kata Sandi</CardTitle>
          <CardDescription className="text-muted-foreground font-medium">Pastikan gunakan kombinasi yang sulit ditebak.</CardDescription>
        </CardHeader>
        <form onSubmit={handlePasswordChange}>
          <CardContent className="grid gap-5 pt-8">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-xs font-bold ml-1 text-muted-foreground">Password Baru</Label>
                <div className="relative">
                  <Input id="new-password" type={showNewPass ? "text" : "password"} className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 font-bold pr-10 focus:bg-background" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimal 6 karakter" />
                  <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground hover:bg-transparent"
                      onClick={() => setShowNewPass(!showNewPass)}
                  >
                      {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-xs font-bold ml-1 text-muted-foreground">Konfirmasi Password Baru</Label>
                <div className="relative">
                  <Input id="confirm-password" type={showConfirmPass ? "text" : "password"} className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 font-bold pr-10 focus:bg-background" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Ulangi password baru" />
                   <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground hover:bg-transparent"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                  >
                      {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-5 bg-muted/5">
            <Button type="submit" className="font-bold rounded-xl h-12 px-10 shadow-none active:scale-95 transition-all" disabled={isPasswordLoading}>
                {isPasswordLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Ubah Password
            </Button>
          </CardFooter>
        </form>
      </Card>
      
      {isAdmin && (
        <>
         <Card className="overflow-hidden bg-card border border-muted-foreground/10 shadow-none rounded-xl">
            <CardHeader className="p-6 text-primary border-b border-muted-foreground/5 bg-muted/20">
                <CardTitle className="font-bold text-sm tracking-tight uppercase">Pengaturan Laporan PDF</CardTitle>
                <CardDescription className="text-muted-foreground font-medium">Informasi resmi untuk kop dan footer laporan PDF.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pt-6">
                <div className="space-y-2">
                    <Label htmlFor="government-agency" className="text-xs font-bold ml-1">Instansi Pemerintah</Label>
                    <Input id="government-agency" className="h-11 rounded-xl bg-muted/30" value={governmentAgency} onChange={e => setGovernmentAgency(e.target.value)} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="education-agency" className="text-xs font-bold ml-1">Dinas Pendidikan</Label>
                    <Input id="education-agency" className="h-11 rounded-xl bg-muted/30" value={educationAgency} onChange={e => setEducationAgency(e.target.value)} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="school-name" className="text-xs font-bold ml-1">Nama Sekolah</Label>
                    <Input id="school-name" className="h-11 rounded-xl bg-muted/30" value={schoolName} onChange={e => setSchoolName(e.target.value)} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="address" className="text-xs font-bold ml-1">Alamat Sekolah</Label>
                    <Input id="address" className="h-11 rounded-xl bg-muted/30" value={address} onChange={e => setAddress(e.target.value)} />
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="report-city" className="text-xs font-bold ml-1">Kota Laporan</Label>
                        <Input id="report-city" className="h-11 rounded-xl bg-muted/30" value={reportCity} onChange={e => setReportCity(e.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="headmaster-name" className="text-xs font-bold ml-1">Nama Kepala Sekolah</Label>
                        <Input id="headmaster-name" className="h-11 rounded-xl bg-muted/30" value={headmasterName} onChange={e => setHeadmasterName(e.target.value)} />
                    </div>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="headmaster-nip" className="text-xs font-bold ml-1">NIP Kepala Sekolah</Label>
                        <Input id="headmaster-nip" className="h-11 rounded-xl bg-muted/30" value={headmasterNip} onChange={e => setHeadmasterNip(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="academic-year" className="text-xs font-bold ml-1">Tahun Ajaran</Label>
                        <Input id="academic-year" className="h-11 rounded-xl bg-muted/30" value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="Contoh: 2025/2026" />
                    </div>
                 </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4 bg-muted/5">
                <Button onClick={handleReportSettingsSave} className="font-bold rounded-xl h-11 shadow-none" disabled={isReportSaving}>
                  <span className="flex items-center justify-center">
                    {isReportSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan Data Laporan
                  </span>
                </Button>
            </CardFooter>
        </Card>

        <Card className="overflow-hidden bg-card border border-muted-foreground/10 shadow-none rounded-xl">
            <CardHeader className="p-6 text-primary border-b border-muted-foreground/5 bg-muted/20">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="font-bold text-sm tracking-tight uppercase">Pengumuman & Kutipan Hari Ini</CardTitle>
                        <CardDescription className="text-muted-foreground font-medium">Pesan yang muncul di layar semua pengguna.</CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Label htmlFor="notification-active" className="text-xs font-bold">Aktifkan</Label>
                        <Switch id="notification-active" checked={isNotificationActive} onCheckedChange={setIsNotificationActive} />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-6">
                <div className="space-y-2">
                    <Label htmlFor="notif-title" className="text-xs font-bold ml-1">Judul Pesan</Label>
                    <Input id="notif-title" className="h-11 rounded-xl bg-muted/30" value={notificationTitle} onChange={e => setNotificationTitle(e.target.value)} placeholder="Contoh: Kutipan Hari Ini" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="notif-content" className="text-xs font-bold ml-1">Isi Pesan / Kutipan</Label>
                    <Textarea id="notif-content" className="rounded-xl bg-muted/30 min-h-[100px]" value={notificationContent} onChange={e => setNotificationContent(e.target.value)} placeholder="Tuliskan isi pengumuman..." />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="notif-interval" className="text-xs font-bold ml-1">Jeda Muncul (Detik)</Label>
                    <div className="flex items-center gap-4">
                        <Input id="notif-interval" type="number" min="0" max="60" className="h-11 rounded-xl bg-muted/30 w-32" value={notificationInterval} onChange={e => setNotificationInterval(Number(e.target.value))} />
                    </div>
                </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4 bg-muted/5">
                <Button onClick={handleNotificationSettingsSave} className="font-bold rounded-xl h-11 shadow-none" disabled={isNotificationSaving}>
                  <span className="flex items-center justify-center">
                    {isNotificationSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan & Aktifkan
                  </span>
                </Button>
            </CardFooter>
        </Card>
        </>
      )}
    </div>
  )
}
