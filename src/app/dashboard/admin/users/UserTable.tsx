'use client';

import { memo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deleteDoc, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

const UserActions = ({ user, onEdit }: { user: any; onEdit: (user: any) => void }) => {
  const firestore = useFirestore();

  const handleDelete = async () => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus pengguna ${user.name}?`)) {
      try {
        if (!firestore) throw new Error("Firestore is not initialized");
        await deleteDoc(doc(firestore, 'users', user.id));
        alert('Pengguna berhasil dihapus.');
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Gagal menghapus pengguna.');
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Buka menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Aksi</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onEdit(user)}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} className="text-red-500">Hapus</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const UserTable = ({ users, onEdit }: { users: any[]; onEdit: (user: any) => void }) => {
  if (!users || users.length === 0) {
    return <div className="text-center text-muted-foreground py-10">Tidak ada data pengguna.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>No. Urut</TableHead>
          <TableHead>Nama</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>
            <span className="sr-only">Aksi</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user, index) => (
          <TableRow key={user.id}>
            <TableCell>{index + 1}</TableCell>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
                <Badge variant="outline">{user.role}</Badge>
            </TableCell>
            <TableCell>
              <UserActions user={user} onEdit={onEdit} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default memo(UserTable);
