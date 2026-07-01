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
import { useUser, useDoc, useFirestore, useMemoFirebase, useAuth, setDocumentNonBlocking } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Loader2, Camera, Eye, EyeOff, UserCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { updatePassword, updateProfile } from 'firebase/auth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { invalidateCache } from '@/lib/cache';

export default function PengaturanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const auth = useAuth();
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
      setGovernmentAgency(schoolConfigData.governmentAgency ?? '');
      setEducationAgency(schoolConfigData.educationAgency ?? '');
      setSchoolName(schoolConfigData.schoolName ?? '');
      setAddress(schoolConfigData.address ?? '');
      setHeadmasterName(schoolConfigData.headmasterName ?? '');
      setHeadmasterNip(schoolConfigData.headmasterNip ?? '');
      setReportCity(schoolConfigData.reportCity ?? '');
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
          toast({ variant: 'destructive', title: 'File terlalu besar', description: 'Maksimal 750KB.' });
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawUser = auth.currentUser;
    if (!rawUser || !userDocRef) return;
    setIsProfileLoading(true);

    try {
      const authUpdates: any = {};
      const firestoreUpdates: any = {};

      if (name.trim() && name !== userData?.name) {
          authUpdates.displayName = name;
          firestoreUpdates.name = name;
      }

      if (photoPreview) {
          authUpdates.photoURL = photoPreview;
          firestoreUpdates.photoURL = photoPreview;
      }

      if (userData?.role !== 'admin') {
          if (nip !== (userData?.nip || '')) firestoreUpdates.nip = nip;
          if (nisn !== (userData?.nisn || '')) firestoreUpdates.nisn = nisn;
          if (position !== (userData?.position || '')) firestoreUpdates.position = position;
      }

      const updatePromises: Promise<any>[] = [];
      if (Object.keys(authUpdates).length > 0) {
          updatePromises.push(updateProfile(rawUser, authUpdates));
      }
      if (Object.keys(firestoreUpdates).length > 0) {
          updatePromises.push(setDoc(userDocRef, firestoreUpdates, { merge: true }));
      }
      
      if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
          invalidateCache();
          toast({ title: 'Berhasil', description: 'Profil telah diperbarui.' });
      }
      setPhotoPreview(null);
    } catch (error: any) {
      console.error("Update Profile Error:", error);
      toast({ variant: 'destructive', title: 'Gagal', description: error.message });
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawUser = auth.currentUser;
    if (!rawUser) return;
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Konfirmasi password tidak cocok.' });
      return;
    }
    setIsPasswordLoading(true);
    try {
      await updatePassword(rawUser, newPassword);
      toast({ title: 'Berhasil', description: 'Password telah diubah.' });
      setNewPassword(''); setConfirmPassword('');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Silakan login ulang untuk keamanan.' });
    } finally {
      setIsPasswordLoading(false);
    }
  };

  const handleReportSettingsSave = () => {
    if (!schoolConfigRef) return;
    setIsReportSaving(true);
    setDocumentNonBlocking(schoolConfigRef, {
      governmentAgency, educationAgency, schoolName, address, headmasterName, headmasterNip, reportCity, academicYear,
    }, { merge: true });
    toast({ title: 'Disimpan', description: 'Data laporan diperbarui.' });
    setIsReportSaving(false);
  };

  const handleNotificationSettingsSave = () => {
    if (!schoolConfigRef) return;
    setIsNotificationSaving(true);
    setDocumentNonBlocking(schoolConfigRef, {
      notificationTitle, notificationContent, isNotificationActive, notificationInterval: Number(notificationInterval),
    }, { merge: true });
    toast({ title: 'Disimpan', description: 'Pengumuman diperbarui.' });
    setIsNotificationSaving(false);
  };

  const getInitials = (n: string | null) => n ? n.split(' ').map(x => x[0]).join('').substring(0, 2).toUpperCase() : 'U';
  const currentPhoto = photoPreview || userData?.photoURL;
  const isTeacherOrStaff = ['guru', 'pegawai', 'kepala_sekolah'].includes(userData?.role || '');
  const positions = isTeacherOrStaff ? ["PNS", "PPPK", "Honorer", "PW"] : ["Pelajar Aktif"];

  if (isUserDataLoading || isAuthLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="grid gap-6 pb-20 max-w-4xl mx-auto">
      <form onSubmit={handleProfileUpdate}>
        <Card className="overflow-hidden border border-muted-foreground/10 shadow-none rounded-xl">
          <CardHeader className="p-6 bg-muted/20 border-b border-muted-foreground/5">
            <div className="flex items-center gap-3">
              <UserCircle className="h-5 w-5 text-primary" />
              <CardTitle className="font-bold text-sm uppercase tracking-tight">Profil Pengguna</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 pt-8">
            <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative">
                  <Avatar className="h-24 w-24 border-2 border-primary/10">
                    <AvatarImage src={currentPhoto ?? undefined} />
                    <AvatarFallback className="bg-primary/5 text-primary font-bold">{getInitials(name)}</AvatarFallback>
                  </Avatar>
                  <Button type="button" size="icon" variant="outline" className="absolute -bottom-1 -right-1 rounded-full h-8 w-8 bg-primary text-white" onClick={() => fileInputRef.current?.click()}><Camera className="h-4 w-4" /></Button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                </div>
                <div className="text-center sm:text-left space-y-1">
                   <h3 className="font-bold text-lg text-primary">{name || 'User'}</h3>
                   <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{userData?.role.replace('_', ' ')}</p>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                    <Label className="text-xs font-bold ml-1">Nama Lengkap</Label>
                    <Input className="h-12 rounded-xl bg-muted/30 font-bold" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs font-bold ml-1">Email</Label>
                    <Input className="h-12 rounded-xl bg-muted/50 font-bold opacity-60" value={userData?.email} readOnly />
                </div>
                {isTeacherOrStaff && (
                  <div className="space-y-2">
                      <Label className="text-xs font-bold ml-1">NIP</Label>
                      <Input className="h-12 rounded-xl bg-muted/30 font-bold" value={nip} onChange={(e) => setNip(e.target.value)} />
                  </div>
                )}
                {userData?.role === 'siswa' && (
                  <div className="space-y-2">
                      <Label className="text-xs font-bold ml-1">NISN</Label>
                      <Input className="h-12 rounded-xl bg-muted/30 font-bold" value={nisn} onChange={(e) => setNisn(e.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                    <Label className="text-xs font-bold ml-1">Status</Label>
                    <Select onValueChange={setPosition} value={position}>
                        <SelectTrigger className="h-12 rounded-xl bg-muted/30 font-bold"><SelectValue placeholder="Pilih status" /></SelectTrigger>
                        <SelectContent className="rounded-xl">{positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-5 bg-muted/5">
            <Button type="submit" className="font-bold rounded-xl h-12 px-10" disabled={isProfileLoading}>{isProfileLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Profil</Button>
          </CardFooter>
        </Card>
      </form>

      {isAdmin && (
        <Card className="overflow-hidden border border-muted-foreground/10 shadow-none rounded-xl">
            <CardHeader className="p-6 bg-muted/20 border-b border-muted-foreground/5">
                <CardTitle className="font-bold text-sm uppercase tracking-tight">Kop Laporan & Pengumuman</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-6">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input placeholder="Instansi" value={governmentAgency} onChange={e => setGovernmentAgency(e.target.value)} className="h-11 rounded-xl bg-muted/30" />
                    <Input placeholder="Dinas" value={educationAgency} onChange={e => setEducationAgency(e.target.value)} className="h-11 rounded-xl bg-muted/30" />
                    <Input placeholder="Nama Sekolah" value={schoolName} onChange={e => setSchoolName(e.target.value)} className="h-11 rounded-xl bg-muted/30 sm:col-span-2" />
                    <Input placeholder="Nama Kepsek" value={headmasterName} onChange={e => setHeadmasterName(e.target.value)} className="h-11 rounded-xl bg-muted/30" />
                    <Input placeholder="NIP Kepsek" value={headmasterNip} onChange={e => setHeadmasterNip(e.target.value)} className="h-11 rounded-xl bg-muted/30" />
                </div>
                <div className="pt-6 border-t mt-4">
                    <div className="flex items-center justify-between mb-4">
                        <Label className="font-bold">Pengumuman Sistem</Label>
                        <Switch checked={isNotificationActive} onCheckedChange={setIsNotificationActive} />
                    </div>
                    <Input placeholder="Judul" value={notificationTitle} onChange={e => setNotificationTitle(e.target.value)} className="h-11 rounded-xl bg-muted/30 mb-2" />
                    <Textarea placeholder="Isi pesan" value={notificationContent} onChange={e => setNotificationContent(e.target.value)} className="rounded-xl bg-muted/30" />
                </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4 bg-muted/5 gap-3">
                <Button onClick={handleReportSettingsSave} disabled={isReportSaving} className="font-bold rounded-xl">Simpan Kop</Button>
                <Button onClick={handleNotificationSettingsSave} disabled={isNotificationSaving} variant="outline" className="font-bold rounded-xl">Simpan Pengumuman</Button>
            </CardFooter>
        </Card>
      )}

      <Card className="overflow-hidden border border-muted-foreground/10 shadow-none rounded-xl">
        <CardHeader className="p-6 bg-muted/20 border-b border-muted-foreground/5">
          <CardTitle className="font-bold text-sm uppercase tracking-tight">Ganti Password</CardTitle>
        </CardHeader>
        <form onSubmit={handlePasswordChange}>
          <CardContent className="grid gap-5 pt-8">
              <div className="relative">
                <Input type={showNewPass ? "text" : "password"} className="h-12 rounded-xl bg-muted/30 pr-10" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Password Baru" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowNewPass(!showNewPass)}>{showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
              </div>
              <div className="relative">
                <Input type={showConfirmPass ? "text" : "password"} className="h-12 rounded-xl bg-muted/30 pr-10" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Konfirmasi Password" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowConfirmPass(!showConfirmPass)}>{showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
              </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-5 bg-muted/5">
            <Button type="submit" className="font-bold rounded-xl h-12" disabled={isPasswordLoading}>Simpan Password</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
