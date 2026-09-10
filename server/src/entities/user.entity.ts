import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AuthProvider = 'demo' | 'qq';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id: number;

  @Column({ type: 'enum', enum: ['demo', 'qq'] }) auth_provider: AuthProvider;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 }) provider_id: string;

  @Column({ type: 'varchar', length: 255 }) nickname: string;

  @Column({ type: 'varchar', length: 500, nullable: true }) avatar_url: string | null;

  @CreateDateColumn() created_at: Date;
}
