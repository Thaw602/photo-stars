import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type MediaType = 'photo' | 'video';

@Entity('photos')
export class Photo {
  @PrimaryGeneratedColumn() id: number;

  @Index() @Column({ type: 'int', nullable: true }) user_id: number | null;

  @Index() @Column({ type: 'enum', enum: ['photo', 'video'] }) media_type: MediaType;

  @Column() file_path: string;

  @Column({ type: 'varchar', nullable: true }) thumbnail_path: string | null;

  @Column({ type: 'bigint' }) file_size: number;

  @Index() @Column({ type: 'date' }) taken_date: string;

  @Column({ type: 'int', default: 0 }) sort_order: number;

  @Column({ type: 'boolean', default: false }) is_builtin: boolean;

  @Column({ type: 'datetime', nullable: true }) deleted_at: Date | null;

  @CreateDateColumn() created_at: Date;
}
