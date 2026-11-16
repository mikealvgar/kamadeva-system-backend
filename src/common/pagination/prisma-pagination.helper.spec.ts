import { describe, expect, it } from 'vitest';
import {
  calculateSkipTake,
  resolvePrismaOrderBy,
} from './prisma-pagination.helper.js';
import { createPaginatedResponse } from '../dto/paginated-response.dto.js';

describe('prisma-pagination.helper', () => {
  describe('calculateSkipTake', () => {
    it('uses defaults when query is undefined or empty', () => {
      expect(calculateSkipTake()).toEqual({ skip: 0, take: 10 });
      expect(calculateSkipTake({})).toEqual({ skip: 0, take: 10 });
    });

    it('calculates 1-indexed skip properly', () => {
      expect(calculateSkipTake({ page: 1, size: 10 })).toEqual({ skip: 0, take: 10 });
      expect(calculateSkipTake({ page: 2, size: 10 })).toEqual({ skip: 10, take: 10 });
      expect(calculateSkipTake({ page: 3, size: 25 })).toEqual({ skip: 50, take: 25 });
    });

    it('clamps negative values safely', () => {
      expect(calculateSkipTake({ page: -5, size: -10 })).toEqual({ skip: 0, take: 1 });
    });
  });

  describe('resolvePrismaOrderBy', () => {
    const allowedFields = {
      nombre: 'nombre',
      name: 'nombre',
      fechaCreacion: 'createdAt',
      createdAt: 'createdAt',
    };
    const defaultOrderBy = { nombre: 'asc' as const };

    it('returns default order when sortBy is not supplied', () => {
      expect(
        resolvePrismaOrderBy({
          allowedFields,
          defaultOrderBy,
        }),
      ).toEqual({ nombre: 'asc' });
    });

    it('maps valid sortBy and direction', () => {
      expect(
        resolvePrismaOrderBy({
          sortBy: 'fechaCreacion',
          direction: 'DESC',
          allowedFields,
          defaultOrderBy,
        }),
      ).toEqual({ createdAt: 'desc' });

      expect(
        resolvePrismaOrderBy({
          sortBy: 'nombre',
          direction: 'ASC',
          allowedFields,
          defaultOrderBy,
        }),
      ).toEqual({ nombre: 'asc' });
    });

    it('falls back to default order when field is not allowed', () => {
      expect(
        resolvePrismaOrderBy({
          sortBy: 'injected_column',
          direction: 'DESC',
          allowedFields,
          defaultOrderBy,
        }),
      ).toEqual({ nombre: 'asc' });
    });
  });

  describe('createPaginatedResponse', () => {
    it('calculates total_pages and flags correctly for empty sets', () => {
      const res = createPaginatedResponse({
        items: [],
        totalRecords: 0,
        page: 1,
        size: 10,
      });

      expect(res).toEqual({
        data: [],
        current_page: 1,
        total_items: 0,
        total_pages: 0,
        has_next_page: false,
        has_prev_page: false,
      });
    });

    it('calculates total_pages, current_page and flags across multiple pages', () => {
      const page1 = createPaginatedResponse({
        items: [1, 2, 3],
        totalRecords: 25,
        page: 1,
        size: 10,
      });
      expect(page1.current_page).toBe(1);
      expect(page1.total_items).toBe(25);
      expect(page1.total_pages).toBe(3);
      expect(page1.has_next_page).toBe(true);
      expect(page1.has_prev_page).toBe(false);

      const page3 = createPaginatedResponse({
        items: [1, 2],
        totalRecords: 25,
        page: 3,
        size: 10,
      });
      expect(page3.current_page).toBe(3);
      expect(page3.total_pages).toBe(3);
      expect(page3.has_next_page).toBe(false);
      expect(page3.has_prev_page).toBe(true);

      const outOfBounds = createPaginatedResponse({
        items: [],
        totalRecords: 25,
        page: 6,
        size: 10,
      });
      expect(outOfBounds.current_page).toBe(6);
      expect(outOfBounds.total_pages).toBe(3);
      expect(outOfBounds.has_next_page).toBe(false);
      expect(outOfBounds.has_prev_page).toBe(true);
    });
  });
});
