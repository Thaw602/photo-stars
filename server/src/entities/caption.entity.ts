import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('captions')
export class Caption {
  @PrimaryGeneratedColumn() id: number;

  @Index({ unique: true })
  @Column({ type: 'int' }) photo_id: number;

  @Column({ type: 'text' }) text: string;

  @Column({ type: 'datetime', nullable: true }) deleted_at: Date | null;
}
