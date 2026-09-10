import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('shares')
export class Share {
  @PrimaryGeneratedColumn() id: number;

  @Index() @Column({ type: 'int' }) photo_id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 }) token: string;

  @Index() @Column({ type: 'datetime' }) expires_at: Date;

  @Column({ type: 'datetime', nullable: true }) deleted_at: Date | null;

  @CreateDateColumn() created_at: Date;
}
