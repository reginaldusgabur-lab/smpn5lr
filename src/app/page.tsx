'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { auth, useUser } from '@/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const loginSchema = z.object({
  email: z.string().email({ message: "Format email tidak valid" }),
  password: z.string().min(1, { message: "Password wajib diisi" }),
});

const resetPasswordSchema = z.object({
  email: z.string().email({ message: "Masukkan alamat email yang valid." }),
});

export default function LoginPage() {
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  const appLogo = PlaceHolderImages.find(p => p.id === 'app-logo');

  useEffect(() => {
    if (!isUserLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isUserLoading, router]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const resetForm = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: '' },
  });

  const handleLogin = async (values: z.infer<typeof loginSchema>) => {
    setIsLoginLoading(true);
    if (!auth) {
      toast({ variant: "destructive", title: "Layanan Belum Siap", description: "Otentikasi belum siap." });
      setIsLoginLoading(false);
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login gagal", description: "Email atau kata sandi salah." });
      setIsLoginLoading(false);
    }
  };

  const handlePasswordReset = async (values: z.infer<typeof resetPasswordSchema>) => {
    setIsResetLoading(true);
    if (!auth) return;
    try {
      auth.languageCode = 'id';
      await sendPasswordResetEmail(auth, values.email);
      toast({ title: "Link terkirim", description: `Cek inbox ${values.email}.` });
      setIsResetDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal", description: "Email tidak terdaftar." });
    } finally {
      setIsResetLoading(false);
    }
  };
  
  if (isUserLoading || user) return <div className="fixed inset-0 bg-background" />;

  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-4 bg-background">
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <Card className="w-full max-w-md bg-card border border-muted-foreground/10 shadow-none rounded-[2.5rem] overflow-hidden">
          <CardHeader className="text-center pt-10 pb-4">
            <div className="flex justify-center mb-2">
              <div className="relative w-32 h-32 transition-transform duration-500 hover:scale-105">
                <Image 
                  src={appLogo?.imageUrl || "/logo-3d-v2.png"} 
                  alt="Logo E-SPENLI" 
                  fill 
                  sizes="128px" 
                  className="object-contain" 
                  priority 
                />
              </div>
            </div>
            <div className="space-y-0.5">
              <CardTitle className="text-4xl font-medium tracking-tight text-primary">E-SPENLI</CardTitle>
              <CardDescription className="font-normal text-muted-foreground/80 text-[10px] whitespace-nowrap px-4">
                Aplikasi absensi digital resmi SMP Negeri 5 Langke Rembong
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-10 pb-8">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
                <FormField control={loginForm.control} name="email" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Alamat Email</Label>
                      <FormControl>
                        <Input 
                          placeholder="nama@email.com" 
                          {...field} 
                          className="h-12 rounded-2xl bg-muted/30 border-muted-foreground/5 font-medium shadow-none focus:bg-background transition-all" 
                        />
                      </FormControl>
                      <FormMessage className="text-[10px] font-bold" />
                    </FormItem>
                  )} />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Kata Sandi</Label>
                    <DialogTrigger asChild>
                      <button type="button" className="text-[10px] font-bold text-primary tracking-widest hover:opacity-70 transition-opacity">Lupa sandi?</button>
                    </DialogTrigger>
                  </div>
                  <FormField control={loginForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <div className="relative">
                          <FormControl>
                            <Input 
                              type={showLoginPass ? 'text' : 'password'} 
                              placeholder="Masukkan kata sandi" 
                              {...field} 
                              className="h-12 rounded-2xl bg-muted/30 border-muted-foreground/5 font-medium shadow-none focus:bg-background transition-all" 
                            />
                          </FormControl>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent shadow-none" 
                            onClick={() => setShowLoginPass(!showLoginPass)}
                          >
                            {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <FormMessage className="text-[10px] font-bold" />
                      </FormItem>
                    )} />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-14 text-sm font-bold rounded-2xl shadow-none bg-primary hover:bg-primary/90 mt-2 tracking-widest active:scale-[0.98] transition-all" 
                  disabled={isLoginLoading}
                >
                  {isLoginLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : "MASUK SEKARANG"}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex-col bg-muted/20 py-5 border-t border-muted-foreground/5">
            <p className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase opacity-60">
              Copyright © 2026 SMP Negeri 5 Langke Rembong
            </p>
          </CardFooter>
        </Card>

        <DialogContent className="rounded-[2.5rem] border-none p-10 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-2xl tracking-tighter text-primary">Atur ulang sandi</DialogTitle>
            <DialogDescription className="font-bold text-xs text-muted-foreground mt-2">
              Masukkan email terdaftar Anda untuk instruksi reset.
            </DialogDescription>
          </DialogHeader>
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit(handlePasswordReset)}>
              <div className="py-8">
                <FormField control={resetForm.control} name="email" render={({ field }) => (
                    <FormItem>
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Email terdaftar</Label>
                      <FormControl>
                        <Input 
                          placeholder="email@anda.com" 
                          {...field} 
                          className="h-12 rounded-2xl bg-muted/30 border-muted-foreground/5 font-medium shadow-none" 
                        />
                      </FormControl>
                      <FormMessage className="text-[10px] font-bold" />
                    </FormItem>
                  )} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isResetLoading} className="w-full h-12 rounded-xl font-bold tracking-widest shadow-none">
                  {isResetLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Kirim link pemulihan"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <footer className="mt-8 text-center text-[9px] font-bold text-muted-foreground/40 leading-relaxed tracking-[0.2em] uppercase">
        created by team operator | All Rights Reserved.
      </footer>
    </div>
  );
}
